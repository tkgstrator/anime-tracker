variable "r2_image_access_key_id" {
  description = "Cloudflare R2 S3 互換 API のアクセスキー ID (nagisa-images バケット用)"
  type        = string
  sensitive   = true
}

variable "r2_image_secret_access_key" {
  description = "Cloudflare R2 S3 互換 API のシークレットアクセスキー (nagisa-images バケット用)"
  type        = string
  sensitive   = true
}

variable "r2_account_id" {
  description = "Cloudflare アカウント ID"
  type        = string
}
