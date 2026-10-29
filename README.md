# 칭찬 스티커 웹앱

Cloudflare Workers + D1 기반의 주간 칭찬 스티커 앱입니다.

## 기능
- 사람1, 사람2, 사람3 기본 대상
- 주간(월~일)별 스티커 누적
- 칭찬받는 사람 추가
- 브라우저별 칭찬하는 사람 이름 저장
- 준 사람, 받은 사람, 시간 기록 공개
- 동일한 사람이 동일 대상에게 한 주에 두 번 주는 중복 기록 방지

## Cloudflare 배포
1. Cloudflare 대시보드에서 Workers & Pages > D1 SQL Database로 이동해 `praise-sticker-db`를 생성합니다.
2. D1 Database ID를 복사해 `wrangler.toml`의 `database_id`에 넣습니다.
3. PC에서 Node.js를 설치하고 터미널에서 프로젝트 폴더로 이동합니다.
4. 다음을 실행합니다.

```bash
npx wrangler login
npx wrangler d1 execute praise-sticker-db --remote --file=schema.sql
npx wrangler deploy
```

5. 배포 완료 후 생성된 workers.dev URL을 공유합니다.

## 유의사항
- 로그인 없는 공개 앱이므로 입력한 이름이 실제 신원인지 확인하지 않습니다.
- 브라우저에 저장된 이름은 해당 브라우저에서만 유지됩니다.
- 스티커 데이터와 대상 목록은 공용 D1 데이터베이스에 저장됩니다.
- 강한 악용 방지나 관리자 권한은 포함되어 있지 않습니다.
