use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindow, WindowEvent};

use crate::paths::{app_data_file, read_state_file, write_atomic, WINDOW_STATE_FILE};

const WINDOW_SAVE_DEBOUNCE: std::time::Duration = std::time::Duration::from_millis(600);
const COMPACT_WINDOW_WIDTH: f64 = 250.0;
const EXPANDED_WINDOW_WIDTH_THRESHOLD: f64 = 560.0;
const MIN_VISIBLE_WINDOW_PX: i32 = 60;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WindowGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub fn save_window_geometry(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return;
    };

    let geometry = WindowGeometry {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    };
    let Ok(payload) = serde_json::to_string(&geometry) else {
        return;
    };

    if let Ok(path) = app_data_file(app, WINDOW_STATE_FILE) {
        let _ = write_atomic(&path, payload.as_bytes());
    }
}

fn is_geometry_visible_on_any_monitor(window: &WebviewWindow, geometry: &WindowGeometry) -> bool {
    let Ok(monitors) = window.available_monitors() else {
        return true;
    };
    if monitors.is_empty() {
        return true;
    }

    monitors.iter().any(|monitor| {
        let monitor_x = monitor.position().x;
        let monitor_y = monitor.position().y;
        let monitor_right = monitor_x + monitor.size().width as i32;
        let monitor_bottom = monitor_y + monitor.size().height as i32;
        let visible_x = geometry
            .x
            .saturating_add(geometry.width as i32)
            .min(monitor_right)
            .saturating_sub(geometry.x.max(monitor_x));
        let visible_y = geometry
            .y
            .saturating_add(geometry.height as i32)
            .min(monitor_bottom)
            .saturating_sub(geometry.y.max(monitor_y));
        visible_x >= MIN_VISIBLE_WINDOW_PX.min(geometry.width as i32)
            && visible_y >= MIN_VISIBLE_WINDOW_PX.min(geometry.height as i32)
    })
}

pub fn restore_window_geometry(window: &WebviewWindow) {
    let Some(payload) = read_state_file(window.app_handle(), WINDOW_STATE_FILE) else {
        return;
    };
    let Ok(saved) = serde_json::from_str::<WindowGeometry>(&payload) else {
        return;
    };
    if saved.width == 0 || saved.height == 0 {
        return;
    }

    let mut geometry = saved.clone();
    let Ok(scale_factor) = window.scale_factor() else {
        return;
    };
    let logical_width = saved.width as f64 / scale_factor;
    if logical_width > EXPANDED_WINDOW_WIDTH_THRESHOLD {
        geometry.width = (COMPACT_WINDOW_WIDTH * scale_factor).round() as u32;
    }

    if !is_geometry_visible_on_any_monitor(window, &geometry) {
        let _ = window.center();
        return;
    }

    let _ = window.set_position(tauri::PhysicalPosition::new(geometry.x, geometry.y));
    let _ = window.set_size(tauri::PhysicalSize::new(geometry.width, geometry.height));
}

pub fn watch_window_geometry(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let (sender, mut receiver) = tokio::sync::mpsc::channel::<()>(1);
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
            let _ = sender.try_send(());
        }
    });

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while receiver.recv().await.is_some() {
            let settled = tokio::time::timeout(WINDOW_SAVE_DEBOUNCE, receiver.recv())
                .await
                .is_err();
            if !settled {
                continue;
            }
            save_window_geometry(&app_handle);
        }
    });
}
