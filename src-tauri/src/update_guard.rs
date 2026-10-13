use std::path::{Component, Path, PathBuf};

pub fn is_allowed_update_url(url: &str) -> bool {
    let url = url.trim();
    url.starts_with("https://github.com/XingAur/stock-widget/releases/")
        || url.starts_with("https://objects.githubusercontent.com/")
        || url.starts_with("https://release-assets.githubusercontent.com/")
}

pub fn update_dir() -> PathBuf {
    std::env::temp_dir().join("aplus-assistant-updates")
}

pub fn installer_file_name(url: &str) -> String {
    url.rsplit('/')
        .next()
        .filter(|name| {
            name.ends_with(".exe")
                && !name.contains("..")
                && !name.contains('/')
                && !name.contains('\\')
        })
        .unwrap_or("APlus_update_setup.exe")
        .to_string()
}

pub fn validate_installer_path(path: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(path);
    if candidate
        .components()
        .any(|part| matches!(part, Component::ParentDir))
    {
        return Err("更新包路径不合法".to_string());
    }
    let is_exe = candidate
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"));
    if !is_exe {
        return Err("更新包必须是安装程序".to_string());
    }
    if !candidate.is_file() {
        return Err("更新包不存在或已损坏".to_string());
    }
    let canonical = candidate
        .canonicalize()
        .map_err(|_| "更新包路径无法解析".to_string())?;
    let dir = update_dir();
    std::fs::create_dir_all(&dir).map_err(|error| format!("创建更新目录失败：{error}"))?;
    let allowed = dir
        .canonicalize()
        .map_err(|_| "更新目录无法解析".to_string())?;
    if !canonical.starts_with(&allowed) {
        return Err("更新包不在允许的目录内".to_string());
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::is_allowed_update_url;

    #[test]
    fn rejects_non_https_and_foreign_hosts() {
        assert!(!is_allowed_update_url(
            "http://github.com/XingAur/stock-widget/releases/x.exe"
        ));
        assert!(!is_allowed_update_url("https://evil.example/A+.exe"));
        assert!(!is_allowed_update_url("C:\\Temp\\setup.exe"));
    }

    #[test]
    fn allows_github_release_assets() {
        assert!(is_allowed_update_url(
            "https://github.com/XingAur/stock-widget/releases/download/v1.2.6/A+_1.2.6_x64-setup.exe"
        ));
    }
}
