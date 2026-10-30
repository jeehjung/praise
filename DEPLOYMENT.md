# 배포 운영 안내

- `dev` 브랜치에 커밋하면 개발 Worker(`praise-sticker-app-dev`)로 자동 배포됩니다.
- `main` 브랜치에 커밋하면 운영 Worker(`praise-sticker-app`)로 자동 배포됩니다.
- 개발 기능 검증 후 Pull Request로 `dev`를 `main`에 병합합니다.
- GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

자동 배포 실행 결과는 GitHub 저장소의 Actions 탭에서 확인합니다.
