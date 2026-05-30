use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct ScannerConfig {
    pub source_name: Option<String>,
    pub roots: Vec<RootConfig>,
    pub server_url: Option<String>,
    pub cache_path: PathBuf,
    pub exclude_patterns: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct RootConfig {
    pub label: String,
    pub path: PathBuf,
}

impl ScannerConfig {
    pub fn effective_source_name(&self) -> String {
        match &self.source_name {
            Some(source_name) if !source_name.is_empty() => source_name.clone(),
            _ => std::env::var("HOSTNAME").unwrap_or_else(|_| "unknown-host".to_string()),
        }
    }
}
