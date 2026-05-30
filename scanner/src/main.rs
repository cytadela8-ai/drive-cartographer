use drive_cartographer_scanner::cli::Cli;
use drive_cartographer_scanner::cli::Command;
use drive_cartographer_scanner::config::ScannerConfig;
use drive_cartographer_scanner::scanner::{ScanOptions, run_scan};
use drive_cartographer_scanner::upload::upload_artifact;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse_args();

    match cli.command {
        Command::Scan {
            config,
            output,
            full_rehash,
            upload,
        } => {
            let config = ScannerConfig::from_path(&config)?;
            let summary = run_scan(
                &config,
                &ScanOptions {
                    output_path: output,
                    full_rehash,
                    show_progress: true,
                    upload,
                },
            )?;
            eprintln!(
                "scan complete: {} files written, {} cache hits, {} errors",
                summary.files_written, summary.cache_hits, summary.errors
            );
        }
        Command::Upload {
            artifact,
            server_url,
        } => upload_artifact(&artifact, Some(&server_url))?,
    }

    Ok(())
}
