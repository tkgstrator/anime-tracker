terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "terraform-state"
    key    = "anime-tracker/terraform.tfstate"
    region = "auto"

    endpoints = {
      s3 = "https://2488ea57494b2dacae95a6e363e7dcb2.r2.cloudflarestorage.com"
    }

    access_key = ""
    secret_key = ""

    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_s3_checksum            = true
  }
}

provider "aws" {
  region = "ap-northeast-1"
}

# Crunchyroll API は US リージョンから呼ぶ必要がある
provider "aws" {
  alias  = "us"
  region = "us-east-1"
}
