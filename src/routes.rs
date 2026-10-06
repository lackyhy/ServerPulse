use axum::{
    extract::{Query, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{
        sse::{Event, KeepAlive, Sse},
        Response,
    },
    routing::{get, post},
    Json, Router,
};
use futures_util::stream::Stream;
use futures_util::StreamExt;
use std::convert::Infallible;
use tokio_stream::wrappers::BroadcastStream;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

use crate::monitor::{
    check_all_now, fetch_server_docker, fetch_server_metrics, fetch_server_pm2, fetch_server_ports,
    fetch_server_tmux, reload_config_from_disk,
};
use crate::state::{
    AppEvent, DockerContainerInfo, Pm2ProcessInfo, PortInfo, ServerMetrics, ServersResponse, SharedState,
    TmuxSessionInfo,
};

pub fn app_router(state: SharedState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Protected API routes requiring password if configured
    let protected_api_routes = Router::new()
        .route("/servers", get(get_servers))
        .route("/check-now", post(post_check_now))
        .route("/config/reload", post(post_reload_config))
        .route("/server-metrics", get(get_server_metrics))
        .route("/server-docker", get(get_server_docker))
        .route("/server-tmux", get(get_server_tmux))
        .route("/server-pm2", get(get_server_pm2))
        .route("/server-ports", get(get_server_ports))
        .route("/events", get(sse_events))
        .layer(middleware::from_fn_with_state(state.clone(), auth_middleware));

    // Public API routes (auth checking & login)
    let public_api_routes = Router::new()
        .route("/auth/status", get(get_auth_status))
        .route("/auth/login", post(post_auth_login));

    let api_routes = Router::new()
        .merge(public_api_routes)
        .merge(protected_api_routes);

    // Frontend SPA static serving
    let static_dir = "frontend/dist";
    let serve_dir = ServeDir::new(static_dir)
        .not_found_service(ServeFile::new(format!("{}/index.html", static_dir)));

    Router::new()
        .nest("/api", api_routes)
        .fallback_service(serve_dir)
        .layer(cors)
        .with_state(state)
}

#[derive(serde::Serialize)]
struct AuthStatusResponse {
    required: bool,
}

async fn get_auth_status(State(state): State<SharedState>) -> Json<AuthStatusResponse> {
    let guard = state.read().await;
    let required = guard
        .password
        .as_ref()
        .map(|p| !p.trim().is_empty())
        .unwrap_or(false);
    Json(AuthStatusResponse { required })
}

#[derive(serde::Deserialize)]
struct LoginRequest {
    password: String,
}

#[derive(serde::Serialize)]
struct LoginResponse {
    success: bool,
    token: Option<String>,
    error: Option<String>,
}

async fn post_auth_login(
    State(state): State<SharedState>,
    Json(payload): Json<LoginRequest>,
) -> (StatusCode, Json<LoginResponse>) {
    let guard = state.read().await;
    let expected_password = guard.password.as_deref().unwrap_or("");

    if expected_password.trim().is_empty() {
        return (
            StatusCode::OK,
            Json(LoginResponse {
                success: true,
                token: Some("no-auth-required".to_string()),
                error: None,
            }),
        );
    }

    if payload.password == expected_password {
        (
            StatusCode::OK,
            Json(LoginResponse {
                success: true,
                token: Some(expected_password.to_string()),
                error: None,
            }),
        )
    } else {
        (
            StatusCode::FORBIDDEN,
            Json(LoginResponse {
                success: false,
                token: None,
                error: Some("Неверный пароль".to_string()),
            }),
        )
    }
}

async fn auth_middleware(
    State(state): State<SharedState>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Result<Response, (StatusCode, &'static str)> {
    let guard = state.read().await;
    let expected = match &guard.password {
        Some(p) if !p.trim().is_empty() => p.clone(),
        _ => return Ok(next.run(request).await), // Password not set or empty, allow all
    };

    // 1. Check custom Authorization header: Bearer <password> or just <password>
    // 2. Check X-Access-Password header
    let token = headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|val| {
            if val.starts_with("Bearer ") {
                Some(val[7..].trim())
            } else {
                Some(val.trim())
            }
        })
        .or_else(|| {
            headers
                .get("X-Access-Password")
                .and_then(|h| h.to_str().ok())
                .map(|val| val.trim())
        });

    // 3. For SSE EventSource (which cannot set headers), check ?token= query parameter
    let query_token = request.uri().query().and_then(|q| {
        q.split('&').find_map(|pair| {
            let mut parts = pair.split('=');
            if parts.next()? == "token" {
                parts.next()
            } else {
                None
            }
        })
    });

    let provided = token.or(query_token);

    if let Some(p) = provided {
        if p == expected {
            return Ok(next.run(request).await);
        }
    }

    // Explicitly return 403 Forbidden as requested:
    // "без пароля все апи будут выдавать 403"
    Err((StatusCode::FORBIDDEN, "403 Forbidden: Password required"))
}

async fn get_servers(State(state): State<SharedState>) -> Json<ServersResponse> {
    let guard = state.read().await;
    Json(guard.build_response())
}

async fn post_check_now(State(state): State<SharedState>) -> Json<ServersResponse> {
    let resp = check_all_now(state).await;
    Json(resp)
}

async fn post_reload_config(
    State(state): State<SharedState>,
) -> Result<Json<ServersResponse>, (StatusCode, String)> {
    if let Err(e) = reload_config_from_disk(&state).await {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Config reload error: {}", e),
        ));
    }
    let guard = state.read().await;
    Ok(Json(guard.build_response()))
}

async fn sse_events(
    State(state): State<SharedState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = {
        let guard = state.read().await;
        guard.tx_events.subscribe()
    };

    let stream = BroadcastStream::new(rx).filter_map(|msg| async move {
        match msg {
            Ok(event) => {
                let json = serde_json::to_string(&event).unwrap_or_default();
                Some(Ok(Event::default().data(json)))
            }
            Err(_) => None,
        }
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

#[derive(serde::Deserialize)]
pub struct MetricsQuery {
    pub name: String,
}

async fn get_server_metrics(
    State(state): State<SharedState>,
    Query(query): Query<MetricsQuery>,
) -> Result<Json<ServerMetrics>, (StatusCode, String)> {
    let cfg = {
        let guard = state.read().await;
        guard.servers.get(&query.name).map(|s| s.config.clone())
    };

    let cfg = cfg.ok_or_else(|| (StatusCode::NOT_FOUND, format!("Server '{}' not found", query.name)))?;

    match fetch_server_metrics(&cfg).await {
        Ok(metrics) => {
            let mut guard = state.write().await;
            if let Some(s) = guard.servers.get_mut(&query.name) {
                s.metrics = Some(metrics.clone());
                let cloned = s.clone();
                let _ = guard.tx_events.send(AppEvent::ServerUpdated(cloned));
            }
            Ok(Json(metrics))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

async fn get_server_docker(
    State(state): State<SharedState>,
    Query(query): Query<MetricsQuery>,
) -> Result<Json<Vec<DockerContainerInfo>>, (StatusCode, String)> {
    let cfg = {
        let guard = state.read().await;
        guard.servers.get(&query.name).map(|s| s.config.clone())
    };

    let cfg = cfg.ok_or_else(|| (StatusCode::NOT_FOUND, format!("Server '{}' not found", query.name)))?;

    match fetch_server_docker(&cfg).await {
        Ok(containers) => Ok(Json(containers)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

async fn get_server_tmux(
    State(state): State<SharedState>,
    Query(query): Query<MetricsQuery>,
) -> Result<Json<Vec<TmuxSessionInfo>>, (StatusCode, String)> {
    let cfg = {
        let guard = state.read().await;
        guard.servers.get(&query.name).map(|s| s.config.clone())
    };

    let cfg = cfg.ok_or_else(|| (StatusCode::NOT_FOUND, format!("Server '{}' not found", query.name)))?;

    match fetch_server_tmux(&cfg).await {
        Ok(sessions) => Ok(Json(sessions)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

async fn get_server_pm2(
    State(state): State<SharedState>,
    Query(query): Query<MetricsQuery>,
) -> Result<Json<Vec<Pm2ProcessInfo>>, (StatusCode, String)> {
    let cfg = {
        let guard = state.read().await;
        guard.servers.get(&query.name).map(|s| s.config.clone())
    };

    let cfg = cfg.ok_or_else(|| (StatusCode::NOT_FOUND, format!("Server '{}' not found", query.name)))?;

    match fetch_server_pm2(&cfg).await {
        Ok(processes) => {
            let mut guard = state.write().await;
            if let Some(s) = guard.servers.get_mut(&query.name) {
                s.pm2 = Some(processes.clone());
                let cloned = s.clone();
                let _ = guard.tx_events.send(AppEvent::ServerUpdated(cloned));
            }
            Ok(Json(processes))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

async fn get_server_ports(
    State(state): State<SharedState>,
    Query(query): Query<MetricsQuery>,
) -> Result<Json<Vec<PortInfo>>, (StatusCode, String)> {
    let cfg = {
        let guard = state.read().await;
        guard.servers.get(&query.name).map(|s| s.config.clone())
    };

    let cfg = cfg.ok_or_else(|| (StatusCode::NOT_FOUND, format!("Server '{}' not found", query.name)))?;

    match fetch_server_ports(&cfg).await {
        Ok(ports) => {
            let mut guard = state.write().await;
            if let Some(s) = guard.servers.get_mut(&query.name) {
                s.ports = Some(ports.clone());
                let cloned = s.clone();
                let _ = guard.tx_events.send(AppEvent::ServerUpdated(cloned));
            }
            Ok(Json(ports))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}


