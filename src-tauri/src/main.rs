// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // Wayland/WebKitGTKプロトコルエラー (Error 71) 回避措置
  std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
  app_lib::run();
}
