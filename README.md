# 칭찬 스티커 웹앱

Cloudflare Workers + D1 기반의 주간 칭찬 스티커 앱입니다.

## 환경 구성

| 구분 | Git 브랜치 | Cloudflare Worker | D1 |
|---|---|---|---|
| 개발 | `dev` | `praise-sticker-app-dev` | `praise-dev-db` |
| 운영 | `main` | `praise-sticker-app` | `praise-db` |

개발과 운영은 Worker 및 D1 데이터베이스를 분리합니다.

## 자동 배포

GitHub Actions가 브랜치 push를 감지해 Cloudflare Workers에 자동 배포합니다.

- `dev` 브랜치 push: `npx wrangler deploy --env dev`
- `main` 브랜치 push: `npx wrangler deploy`

GitHub 저장소 Settings > Secrets and variables > Actions에 다음 Repository secrets를 등록해야 합니다.

- `CLOUDFLARE_API_TOKEN`: Workers 배포 및 D1 리소스 조회에 필요한 권한을 가진 Cloudflare API Token
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 계정 ID

두 Secret이 등록되기 전까지 GitHub Actions 배포는 인증 단계에서 실패합니다. Secret 값은 코드에 직접 넣지 마세요.

## 데이터베이스 초기화

Worker는 첫 요청 시 필요한 테이블을 자동 생성하고, people 테이블이 비어 있으면 기본 대상 3명을 추가합니다. 별도 SQL 실행은 필수가 아닙니다.

수동 초기화가 필요한 경우 각 환경의 D1에 `schema.sql`을 실행할 수 있습니다. 운영 DB와 개발 DB를 혼동하지 않도록 주의하세요.

## 주요 기능

- 기본 칭찬 대상 3명
- 주간(월~일)별 스티커 누적
- 칭찬받는 사람 추가
- 브라우저별 칭찬하는 사람 이름 저장
- 준 사람, 받은 사람, 시간 기록 공개
- 동일한 사람이 동일 대상에게 한 주에 두 번 주는 중복 기록 방지

## 유의사항

- 로그인 없는 공개 앱이므로 입력한 이름이 실제 신원인지 확인하지 않습니다.
- 브라우저에 저장된 이름은 해당 브라우저에서만 유지됩니다.
- 스티커 데이터와 대상 목록은 공용 D1 데이터베이스에 저장됩니다.
- 강한 악용 방지나 관리자 권한은 포함되어 있지 않습니다.
