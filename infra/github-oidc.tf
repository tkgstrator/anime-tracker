# GitHub Actions OIDC: CI から AWS へ一時認証で Lambda をデプロイするための
# 最小権限ロール。静的な AWS アクセスキーを GitHub に置かないための仕組み。

# アカウントに 1 つだけ作成する GitHub OIDC プロバイダ。
# thumbprint は GitHub Actions 用の既知値（AWS は現在検証に使わないが必須項目）。
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# CI 専用のデプロイロール。指定リポジトリの develop / master からのみ assume 可能。
resource "aws_iam_role" "github_actions_lambda_deploy" {
  name = "github-actions-lambda-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = [
              "repo:tkgstrator/nagisa-webui:ref:refs/heads/develop",
              "repo:tkgstrator/nagisa-webui:ref:refs/heads/master"
            ]
          }
        }
      }
    ]
  })
}

# 必要最小限: fetch 関数のコード/設定更新、レイヤ取得、実行ロールの PassRole のみ。
resource "aws_iam_role_policy" "github_actions_lambda_deploy" {
  name = "lambda-deploy"
  role = aws_iam_role.github_actions_lambda_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LambdaDeploy"
        Effect = "Allow"
        Action = [
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration"
        ]
        Resource = [aws_lambda_function.fetch.arn, "${aws_lambda_function.fetch.arn}:*"]
      },
      {
        Sid      = "LambdaLayerRead"
        Effect   = "Allow"
        Action   = ["lambda:GetLayerVersion", "lambda:ListLayerVersions"]
        Resource = "*"
      },
      {
        Sid      = "PassExecRole"
        Effect   = "Allow"
        Action   = ["iam:GetRole", "iam:PassRole"]
        Resource = aws_iam_role.lambda_exec.arn
      }
    ]
  })
}

output "github_actions_lambda_deploy_role_arn" {
  value = aws_iam_role.github_actions_lambda_deploy.arn
}
