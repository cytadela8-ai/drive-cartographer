use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(name = "drive-cartographer-scan")]
#[command(about = "Scan file roots and produce Drive Cartographer CSV artifacts")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    Scan {
        #[arg(long)]
        config: PathBuf,
        #[arg(long)]
        output: PathBuf,
        #[arg(long)]
        full_rehash: bool,
        #[arg(long)]
        upload: bool,
    },
    Upload {
        #[arg(long)]
        artifact: PathBuf,
        #[arg(long)]
        server_url: String,
    },
}

impl Cli {
    pub fn parse_args() -> Self {
        Self::parse()
    }
}
