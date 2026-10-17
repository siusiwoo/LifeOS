# LifeOS 일정 푸시 알림 설정

기존 일정은 `lifeos_records`의 `categories` 기록 안에 그대로 있습니다. 이 설정은 알림을 받을 기기와 발송 이력만 새 테이블에 추가합니다. 일정이나 다른 기록을 지우지 않습니다.

1. Supabase SQL Editor에서 `LifeOS_SQL/calendar_push.sql`을 실행합니다.
2. 프로젝트 폴더에서 `npx web-push generate-vapid-keys --json`으로 VAPID 키 한 쌍을 만듭니다. 개인 키는 GitHub나 화면 캡처에 올리지 마세요.
3. Vercel 프로젝트의 **Settings → Environment Variables**에서 Production용 `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:본인메일주소`), `CALENDAR_CRON_SECRET` (충분히 긴 임의 문자열)을 등록합니다. 기존 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`도 있어야 합니다. 값을 저장한 뒤 새 배포가 필요합니다.
4. Supabase **Integrations → Cron**에서 Cron과 `pg_net`을 활성화합니다. Supabase **Vault**에 `lifeos_calendar_cron_secret` 이름으로 Vercel의 `CALENDAR_CRON_SECRET`과 **같은 값**을 저장합니다.
5. `LifeOS_SQL/calendar_push_cron.sql`을 SQL Editor에서 실행합니다. 이 작업은 매분 서버 함수를 호출합니다.
6. 배포 후 사이트에서 로그인하고 알림이 있는 일정을 저장하면, 이 기기의 알림 허용 창이 뜹니다. 허용하면 서버 푸시 알림이 자동으로 켜집니다. 캘린더의 **알림 켜기/끄기**는 나중에 설정을 바꿀 때 사용합니다. iPhone은 Safari에서 사이트를 홈 화면에 추가하고 그 홈 화면 아이콘으로 연 뒤 알림을 허용해야 합니다.

알림 시각은 한국 시간(Asia/Seoul)으로 계산합니다. 서버는 직전 10분의 도착 대상만 확인하고, 발송 기록으로 중복을 막습니다. Supabase 동기화에 성공한 로그인 계정의 일정만 서버 알림 대상입니다. 서버 예약 작업이나 푸시 서비스가 늦으면 알림도 늦을 수 있습니다. 브라우저 자체의 알림 허용, 기기의 알림 설정, 네트워크 연결이 필요합니다.

확인 방법: 5분 뒤 시작하는 일정을 만들고 알림을 **정해진 시간에**로 설정합니다. 알림 허용 창이 뜨면 허용하고, 화면에 Supabase 저장 상태가 표시된 뒤 사이트를 닫고 알림을 기다립니다. Supabase Cron의 실행 기록과 Vercel 함수 로그에서 `sent`가 증가하는지 확인할 수 있습니다. 테스트가 끝나면 캘린더의 **알림 끄기**로 기기 구독을 해제할 수 있습니다.

