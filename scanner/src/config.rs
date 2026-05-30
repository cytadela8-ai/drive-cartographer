use crate::errors::ScannerError;
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize)]
pub struct ScannerConfig {
    pub source_name: Option<String>,
    pub roots: Vec<RootConfig>,
    #[serde(default)]
    pub server_url: Option<String>,
    pub cache_path: PathBuf,
    #[serde(default)]
    pub exclude_patterns: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RootConfig {
    pub label: String,
    pub path: PathBuf,
}

impl ScannerConfig {
    pub fn from_path(path: &PathBuf) -> Result<Self, ScannerError> {
        let content = fs::read_to_string(path).map_err(|source| ScannerError::Io {
            path: path.display().to_string(),
            source,
        })?;
        toml::from_str(&content).map_err(|source| ScannerError::Config {
            path: path.display().to_string(),
            source,
        })
    }

    pub fn effective_source_name(&self) -> String {
        match &self.source_name {
            Some(source_name) if !source_name.is_empty() => source_name.clone(),
            _ => std::env::var("HOSTNAME").unwrap_or_else(|_| "unknown-host".to_string()),
        }
    }
}
