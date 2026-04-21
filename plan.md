# 아이 영어 따라읽기 프로그램 개발 계획

## 1. 목표

스캔한 영어 책을 페이지 단위로 보여주고, AI가 먼저 읽어 준 뒤 아이가 따라 읽으면 단어 단위로 진행 상황과 정확도를 보여 주는 태블릿 중심 독서 학습 프로그램을 만든다.

이번 버전의 전제는 아래와 같다.

- AI 기능은 가능한 한 `Google Cloud` 중심으로 사용
- 다만 아이 읽기 평가는 `Azure Pronunciation Assessment`를 사용
- 저장소는 `Supabase`
- 배포는 `Vercel`
- 사용 기기는 `pad(태블릿)` 중심
- 설치형 앱처럼 쓰기 위해 `PWA` 형태가 중요
- 텍스트 하이라이트는 이전에 제안한 방식으로 적용
- 책 등록은 우선 `관리자(부모) 수동 입력` 중심으로 설계
- OCR 자동화는 이후 확장 기능으로 추가

---

## 2. 최종 권장 스택

### 프론트엔드

- `Next.js + TypeScript`
- `PWA` 지원
- `Vercel` 배포

### 백엔드/데이터

- `Supabase Postgres`
- `Supabase Storage`
- 필요 시 `Supabase Edge Functions`

### AI/음성/문서 처리

- 책 등록 기본 방식: `수동 이미지 업로드 + 수동 텍스트 입력`
- OCR 확장 기능 1순위: `Google Cloud Vision API - DOCUMENT_TEXT_DETECTION`
- OCR 고정밀 확장 기능: `Google Cloud Document AI OCR`
- TTS: `Google Cloud Text-to-Speech`
- 아이 읽기 평가: `Azure Speech Pronunciation Assessment`
- 필요 시 보조 전사/디버깅: `Google Cloud Speech-to-Text`

### 왜 이 조합이 맞는가

- Vercel은 Next.js 배포와 PWA 운영이 편하다
- Supabase는 DB, 인증, 스토리지를 한 번에 관리하기 쉽다
- Google Cloud는 OCR/TTS 비용과 시작 속도 측면에서 유리하다
- Azure Pronunciation Assessment는 읽기 평가 기능이 교육용 시나리오에 더 직접적으로 맞는다
- 태블릿 웹앱을 빠르게 MVP로 만드는 데 가장 효율적이다

---

## 3. 무료/저비용 관점 추천

## 3.1 현재 선택의 적합성

지금 전제인 `Vercel + Supabase + Google Cloud API` 조합은 MVP 기준으로 충분히 좋다.  
완전히 무료만으로 장기 운영하는 것은 어렵지만, 초기 개발/검증 단계에서는 비용을 매우 낮게 유지할 수 있다.

## 3.2 꼭 알아야 할 현재 무료/저비용 기준

기준일: `2026-04-20`

- Google Cloud Vision API는 공식 가격 문서 기준으로 매월 첫 `1000` OCR units가 무료다
- Google Cloud Speech-to-Text는 공식 문서 기준으로 매월 `60분`까지 무료 사용이 가능하다
- Google Cloud Text-to-Speech는 공식 가격 문서 기준으로
  - `Standard/WaveNet` 계열은 월 `400만 자` 무료
  - `Neural2/Polyglot/Chirp 3 HD` 계열은 월 `100만 자` 무료
- Supabase Free는 공식 문서 기준으로 Storage `1GB`
- Cloudflare R2는 공식 문서 기준으로 `10 GB-month` 무료, egress 무료

## 3.3 더 좋은 무료 클라우드가 있다면?

엄밀히 말하면 “전체 스택을 더 좋게 무료로 대체”할 만한 조합은 많지 않다.  
다만 **스토리지 용량이 빨리 커질 가능성**이 있으면 아래 대안을 추천할 수 있다.

### 추천 대안 1: `Cloudflare R2`

용도:

- 책 이미지
- 미리 생성한 TTS 오디오
- 공개 정적 자산 저장

장점:

- Supabase Free의 `1GB`보다 여유가 크다
- egress 비용이 없다
- 오디오/이미지 자산 배포에 유리하다

단점:

- Supabase Storage와 스토리지가 이원화된다
- 현재 사용 의도인 Supabase 중심 설계와는 조금 멀어진다

결론:

- **초기 MVP는 Supabase Storage로 시작**
- 저장 공간이 빨리 부족해지면 `책 이미지 + TTS 오디오`만 `Cloudflare R2`로 분리하는 방식이 가장 현실적이다

### 추천 대안 2: 로컬 OCR 보조

클라우드 비용을 더 줄이고 싶으면, 책 등록용 PC에서 `Tesseract` 같은 로컬 OCR을 1차로 돌리고, 품질이 낮은 페이지만 Google OCR을 호출하는 하이브리드 전략도 가능하다.

이 방식은 클라우드가 아니라 로컬 처리지만, 장기적으로 OCR 비용 절감 효과가 크다.

---

## 4. 제품 형태

초기 제품은 **태블릿 최적화 PWA 웹앱**으로 만드는 것이 맞다.

이유:

- 앱스토어 배포 없이 바로 설치형처럼 쓸 수 있다
- 책 이미지와 텍스트를 큰 화면에서 안정적으로 보여 주기 좋다
- 관리 화면과 아이 학습 화면을 한 제품 안에서 빠르게 만들 수 있다

---

## 5. 태블릿/PWA UX 방향

## 5.1 화면 구조

- 상단: 책 페이지 이미지
- 하단: 따라 읽을 텍스트
- 좌우 또는 상단: 이전/다음 페이지, 재생, 녹음, 다시 듣기
- 옵션: 한 페이지 보기 / 두 페이지 보기

## 5.2 텍스트 하이라이트 방식

### AI가 읽을 때

- 기본 상태: 연한 회색 텍스트
- 현재 읽는 단어: 진한 검정 또는 짙은 남색
- 이미 읽은 단어: 중간 회색
- 현재 문장 배경: 아주 연한 노랑 또는 하늘색

### 아이가 읽을 때

- 기본 상태: 진회색 텍스트
- 잘 읽은 단어: 파란색 채움
- 애매한 단어: 주황색 표시
- 누락/오독 단어: 빨간 밑줄 또는 작은 경고 점

핵심 원칙:

- “틀렸다”보다 “어디를 다시 읽으면 되는지”가 더 중요하다
- 빨간색은 최소화하고 재도전 UX를 우선한다

## 5.3 태블릿 UI 원칙

- 기본은 `landscape` 우선 설계
- 터치 버튼은 최소 `48px` 이상
- 텍스트는 아이가 멀리서도 읽기 쉬운 큰 크기 사용
- 페이지 전환과 하이라이트는 부드럽지만 과하지 않게
- 오프라인 상태에서도 마지막 읽던 책 일부는 열 수 있게 캐시

## 5.4 PWA 요구사항

- 설치 가능
- 홈 화면 아이콘
- 전체 화면 또는 앱처럼 보이는 UI
- 현재 책과 다음 페이지 자산 프리캐시
- 서비스 워커 기반 캐시 전략

권장 캐시 전략:

- 책 이미지/TTS 오디오: `cache-first`
- 세션 결과/평가 저장: `network-first`

---

## 6. 핵심 사용자 흐름

### 관리자/부모

1. 책 생성
2. 페이지 이미지 업로드
3. 페이지 순서 확인
4. 페이지별 텍스트 입력 또는 전체 텍스트 붙여넣기
5. 페이지별 TTS 생성
6. 아이에게 읽기 세션 제공

### 아이

1. 책 선택
2. 한 페이지 또는 두 페이지 보기 선택
3. AI가 읽기
4. 텍스트가 단어 단위로 진행 표시
5. 아이가 따라 읽기
6. 시스템이 단어별로 평가
7. 페이지 결과 확인
8. 다시 읽기 또는 다음 페이지 이동

---

## 7. 책 입력 전략

## 7.1 MVP 권장 방식

초기 MVP에서는 **OCR보다 수동 입력 중심**으로 가는 것이 맞다.

권장 기본 흐름:

1. 관리자가 책을 생성
2. 페이지 이미지를 여러 장 한 번에 업로드
3. 시스템이 파일명 기준으로 페이지 순서를 자동 정렬
4. 관리자가 페이지별 텍스트를 입력
5. 저장 후 TTS 생성

이 방식의 장점:

- OCR 오차 때문에 생기는 수정 비용을 줄인다
- 구현이 단순하고 안정적이다
- 책 데이터 품질을 처음부터 높게 유지할 수 있다
- 초기 운영자가 부모 1명 또는 소수일 때 가장 현실적이다

## 7.2 “한 장씩 순서대로 입력 + 텍스트 입력” 방식의 평가

이 방식은 **정확도는 높지만 운영 효율은 낮다**.

좋은 점:

- 페이지와 텍스트 매칭 실수가 적다
- 구현이 가장 단순하다
- 문제가 생겼을 때 어느 페이지에서 틀렸는지 바로 찾기 쉽다

아쉬운 점:

- 페이지 수가 많은 책에서 입력 피로가 크다
- 매번 업로드와 저장을 반복하면 속도가 느리다
- 부모가 긴 텍스트를 여러 페이지에 나눠 넣을 때 불편하다

결론:

- **MVP 초기에는 충분히 효과적이다**
- 하지만 실제 사용성을 생각하면 이것만으로는 부족하다

## 7.3 더 좋은 입력 방법

가장 좋은 방식은 **이미지는 일괄 업로드하고, 텍스트는 페이지별 편집과 일괄 붙여넣기를 함께 지원하는 혼합 방식**이다.

권장 입력 UX:

- 페이지 이미지는 여러 장을 한 번에 업로드
- 업로드 후 썸네일 목록에서 순서 드래그 정렬
- 선택한 페이지의 텍스트를 오른쪽 패널에서 편집
- 필요하면 책 전체 텍스트를 한 번에 붙여넣고 페이지 구분자로 자동 분배

이 방식이 좋은 이유:

- 이미지 등록은 빠르다
- 페이지별 검수는 정확하다
- 텍스트가 이미 있는 부모는 훨씬 빨리 입력할 수 있다
- 나중에 OCR 자동 채우기 기능을 붙이기도 쉽다

## 7.4 가장 추천하는 입력 모델

초기 제품에서는 아래 3가지 입력 모드를 지원하는 것이 가장 좋다.

### 모드 A. 페이지별 수동 입력

- 페이지 이미지 1개 선택
- 해당 페이지 텍스트 직접 입력

적합한 경우:

- 짧은 책
- 처음 등록하는 사용자
- 정확도를 최우선으로 볼 때

### 모드 B. 이미지 일괄 업로드 + 페이지별 텍스트 입력

- 페이지 이미지를 한 번에 업로드
- 페이지 썸네일을 넘기며 텍스트 입력

적합한 경우:

- 가장 현실적인 기본 모드
- 대부분의 부모/관리자 작업

### 모드 C. 이미지 일괄 업로드 + 전체 텍스트 일괄 붙여넣기

- 책 전체 텍스트를 한 번에 붙여넣기
- `Page 1`, `Page 2` 같은 구분자 또는 빈 줄 규칙으로 자동 분배
- 분배 후 각 페이지에서 미세 수정

적합한 경우:

- 이미 전자 텍스트가 있는 경우
- 빠른 등록이 중요한 경우

## 7.5 최종 추천 결론

관리자 입력 방식의 기본값은 아래가 가장 적절하다.

- **이미지: 여러 장 일괄 업로드**
- **텍스트: 페이지별 입력**
- **보조 기능: 전체 텍스트 일괄 붙여넣기**

즉, “한 장씩 순서대로 모두 입력”을 기본 워크플로우로 두기보다,  
**이미지는 배치 처리하고 텍스트는 페이지 단위로 검수하는 방식**이 더 좋다.

이 구성이 구현 난이도와 운영 효율의 균형이 가장 좋다.

## 7.6 이후 확장 기능으로서 OCR

OCR은 초기 핵심 흐름이 아니라 **입력 보조 자동화 기능**으로 두는 것이 적절하다.

확장 시나리오:

- 페이지 이미지를 올리면 OCR 결과를 자동 초안으로 채움
- 부모는 초안만 검수/수정
- OCR 품질이 낮은 책은 수동 입력 유지

우선순위:

1. MVP: 수동 입력
2. Feature 확장: Google Vision OCR 자동 초안
3. 고도화: Document AI OCR 또는 로컬 OCR 보조

## 7.7 관리자 입력 화면 필수 기능

- 다중 이미지 업로드
- 파일명 기준 자동 페이지 번호 부여
- 드래그로 페이지 순서 변경
- 현재 페이지 이미지 미리보기
- 페이지별 텍스트 편집
- 전체 텍스트 일괄 붙여넣기
- 페이지 상태 표시: `미입력`, `작성중`, `완료`
- 텍스트 수정 후 TTS 재생성 버튼

---

## 8. TTS 전략

## 8.1 질문에 대한 결론

이 서비스에서는 **TTS를 실시간으로 매번 Google API에 요청하는 방식보다, 미리 생성해서 저장해 두는 방식이 기본**이어야 한다.

또한 TTS 엔진은 현재 요구사항 기준으로 `Google Cloud Text-to-Speech Neural2`를 기본으로 쓰는 것이 가장 적절하다.

이유:

- 자연스러운 목소리 품질이 충분히 좋다
- `speaking_rate` 조절이 가능하다
- SSML을 활용할 수 있다
- `<mark>` timepoint를 이용해 하이라이트 동기화가 가능하다
- 부모가 원하는 스타일을 공통 프리셋으로 관리하기 좋다

정확히는 아래의 **하이브리드 전략**이 가장 좋다.

### 기본 전략

- 페이지 텍스트가 확정되면 TTS를 한 번 생성
- 생성된 오디오를 `Supabase Storage`에 저장
- 오디오 메타데이터를 `Supabase Postgres`에 저장
- 아이가 읽을 때는 저장된 오디오를 바로 재생

### 예외 전략

- 오디오가 아직 없으면 최초 1회만 Google TTS 호출
- 생성 후 즉시 저장
- 다음부터는 저장본 사용

## 8.2 왜 Neural2를 기본으로 선택하는가

후보를 비교하면 아래와 같다.

### `Neural2`

- 자연스러움과 제어 가능성의 균형이 가장 좋다
- 하이라이트 구현에 필요한 SSML/timepoint 흐름과 잘 맞는다
- MVP 기본 엔진으로 가장 안전하다

### `Studio`

- 내레이션 품질은 좋지만 `<mark>` 지원이 제한적이라 페이지 하이라이트와 결합하기 불리하다

### `Chirp 3 HD`

- 매우 자연스럽고 감정 표현도 좋다
- 다만 현재 MVP에서는 하이라이트 동기화와 제어 일관성 측면에서 기본 엔진으로 쓰기에는 리스크가 있다

결론:

- **기본 엔진은 `Neural2`**
- 이후 별도 실험 기능으로 `Studio` 또는 `Chirp 3 HD`를 검토

## 8.3 왜 미리 생성이 맞는가

- 재생 지연이 줄어든다
- 같은 페이지를 반복해서 들을 때 비용이 줄어든다
- 네트워크 상태가 약해도 UX가 안정적이다
- PWA 캐시와 잘 맞는다

## 8.4 부모 설정 방식

운영 효율을 생각하면 **부모 공통 음성 프리셋을 기본으로 두고, 책별 설정은 선택적 override만 허용하는 방식**이 가장 좋다.

권장 구조:

- `가족/부모 기본 TTS 프리셋`
- `책별 override 여부`
- override가 없으면 기본 프리셋 상속

이 구조가 좋은 이유:

- 대부분의 책에서 같은 톤과 속도를 유지할 수 있다
- 아이가 일관된 목소리에 익숙해지기 쉽다
- 관리 포인트가 적다
- 특별한 책만 다른 분위기로 바꿀 수 있다

## 8.5 부모에게 노출할 옵션

초기에는 슬라이더를 많이 열어두기보다 **프리셋 우선**이 좋다.

권장 기본 프리셋:

- `차분하게 읽기`
- `즐겁게 읽기`
- `또박또박 따라읽기`
- `이야기책 모드`

고급 설정으로만 노출:

- `voice`
- `speaking_rate`
- `style`
- `sentence_pause_level`

초기에는 `pitch`나 추상적인 `밝기`를 직접 조절하게 하기보다, 프리셋 안에 묶어두는 편이 UX와 운영 모두에 유리하다.

## 8.6 기본 추천값

초등 3학년, 7살 남아가 따라 읽는 상황을 기준으로 한 추천값은 아래와 같다.

- 기본 속도: `0.9`
- 따라읽기 프리셋: `0.85 ~ 0.9`
- 이야기 감상 프리셋: `0.93 ~ 0.98`
- 기본 스타일 후보: `calm` 또는 `lively`

초기 기본값 제안:

- voice: `en-US-Neural2-F` 또는 `en-US-Neural2-J`
- 기본 프리셋: `또박또박 따라읽기`
- 기본 속도: `0.9`

최종 voice 선택은 부모가 샘플 문장 2~3개를 미리 들어보고 고르게 하는 것이 좋다.

## 8.7 저장해야 하는 데이터

페이지 단위 TTS 자산:

- `audio_url`
- `voice_name`
- `speaking_rate`
- `style_name`
- `sentence_pause_level`
- `text_version`
- `duration_ms`

하이라이트용 메타데이터:

- 문장 목록
- 단어 토큰 목록
- 각 단어 또는 마커의 시간 오프셋

설정 데이터:

- `default_tts_profile_id`
- `book_tts_profile_override_id`
- `tts_profile_name`
- `preview_sample_text`

## 8.8 Google TTS에서 하이라이트 맞추는 방식

Google Cloud TTS는 공식 SSML 문서 기준으로 `<mark>`를 사용한 timepoint 반환을 지원한다.  
따라서 페이지 텍스트를 SSML로 만들고 단어 또는 구간 단위로 mark를 넣어 시간 정보를 저장하는 방식이 유력하다.

실무 권장:

1. 처음에는 문장 단위 mark로 시작
2. 이후 단어 단위 mark가 안정적이면 단어 단위로 확장

이유:

- 단어 단위 mark는 더 정밀하지만 구현 복잡도가 올라간다
- MVP에서는 우선 문장 단위 또는 짧은 구간 단위로도 충분히 좋은 UX를 만들 수 있다

---

## 9. 아이 음성 평가 전략

## 9.1 최종 권장안

아이 따라읽기 평가는 `Azure Speech Pronunciation Assessment`를 사용하는 것이 더 적합하다.

이유:

- reading scenario에 직접 맞는 기능이다
- reference text 기반 평가가 가능하다
- 정확도, 유창성, 완성도, 운율 등의 점수를 활용할 수 있다
- 단어 수준 오류 유형을 받아 UI에 연결하기 좋다

따라서 MVP는 직접 채점 로직을 새로 만드는 대신, **Azure Pronunciation Assessment를 중심 엔진으로 사용**하는 방향이 맞다.

## 9.2 권장 평가 방식

1. 아이 음성을 브라우저에서 녹음
2. 서버에서 Azure Speech Pronunciation Assessment 호출
3. reference text를 함께 전달
4. 단어 수준 결과와 전체 점수 수신
5. 결과를 UI용 상태로 변환
6. 각 단어 상태 계산

단어 상태 예시:

- `pending`
- `correct`
- `partial`
- `missed`
- `inserted`
- `wrong`

## 9.3 점수 계산 방식

MVP 점수는 Azure 결과를 기반으로 아래 항목을 조합하면 된다.

- pronunciation accuracy
- fluency
- completeness
- prosody
- 단어 수준 error type
- 페이지 끝까지 읽었는지 여부

제품 UI에는 모든 원시 점수를 그대로 보여주기보다 아래처럼 단순화하는 것이 좋다.

- 잘 읽은 단어
- 다시 읽을 단어
- 페이지 전체 점수
- 한 줄 피드백

## 9.4 중요한 설계 원칙

브라우저 내장 speech recognition에 의존하지 말고, **녹음 후 서버에서 Azure Speech 평가 API를 호출**하는 구조가 좋다.

이유:

- 브라우저별 지원 차이가 크다
- 태블릿 환경에서 일관성이 떨어질 수 있다
- 서버 기반이 결과 저장과 후처리에 유리하다

## 9.5 Google Cloud와 Azure를 함께 쓰는 이유

이 프로젝트에서는 멀티 클라우드가 과한 선택이 아니라 기능 최적화에 가깝다.

- OCR: Google이 시작 비용과 사용성이 좋다
- TTS: Google TTS를 사전 생성용으로 쓰기 좋다
- 읽기 평가: Azure Pronunciation Assessment가 더 목적 적합하다

즉, 전체 플랫폼은 단순하게 유지하되, **아이 읽기 평가만 Azure로 분리**하는 방식이 가장 현실적이다.

---

## 10. 저장 구조

## 10.1 Supabase Storage 버킷 설계

- `book-pages`: 스캔 페이지 이미지
- `book-imports`: 원본 업로드 메타데이터
- `book-audio`: 미리 생성한 TTS 오디오
- `reading-recordings`: 아이 읽기 녹음 파일
- `book-covers`: 표지 이미지

비용 절감 규칙:

- `reading-recordings`는 영구 저장하지 않는다
- 평가 완료 후 삭제하거나 짧은 보관 기간만 둔다

## 10.2 DB 테이블 제안

- `books`
- `book_pages`
- `book_import_jobs`
- `tts_profiles`
- `parent_settings`
- `page_text_versions`
- `page_tokens`
- `page_tts_assets`
- `reading_sessions`
- `reading_attempts`
- `word_assessments`

핵심 필드 예시:

- `book_pages`: 페이지 번호, 이미지 경로, 입력 상태, 확정 텍스트
- `book_import_jobs`: 업로드 방식, 일괄 업로드 여부, 처리 상태
- `tts_profiles`: voice, speaking_rate, style_name, pause_level, is_default
- `parent_settings`: 기본 TTS 프로필, 기본 보기 모드, 기본 학습 옵션
- `page_tokens`: 표시 텍스트, 정규화 텍스트, 순서, 문장 번호
- `page_tts_assets`: 오디오 경로, voice, tts_profile_id, text_version_id, timing_json
- `word_assessments`: token_id, result_state, confidence, recognized_text

---

## 11. 아키텍처 제안

## 11.1 기본 구조

- 클라이언트: `Next.js` 앱
- 배포: `Vercel`
- DB/Storage/Auth: `Supabase`
- AI API 호출: `Vercel Route Handlers` 또는 `Server Actions`
- 외부 AI 서비스:
  - `Google Cloud` for TTS and future OCR automation
  - `Azure Speech` for pronunciation assessment

## 11.2 왜 이 구조가 좋은가

- 프론트와 서버 코드를 한 저장소에서 관리하기 쉽다
- Google API 키를 서버 쪽 환경변수로 안전하게 관리할 수 있다
- MVP 속도가 빠르다

## 11.3 비동기 작업 처리

TTS는 페이지 단위로 실행하면 된다.  
초기에는 대규모 큐 시스템 없이도 충분하다.

권장 방식:

- 관리자 화면에서 `텍스트 저장`
- 관리자 화면에서 `TTS 생성`
- 각 작업 결과를 DB에 상태로 저장

주의:

- Vercel Hobby의 cron은 공식 문서 기준으로 `하루 1회` 제한이 있으므로, 초기에는 cron 기반 배치 설계에 기대지 않는 것이 좋다

---

## 12. 비용 절감 전략

## 12.1 OCR

- MVP에서는 OCR을 기본 흐름에 넣지 않는다
- OCR은 이후 입력 자동화 feature로 추가한다
- OCR이 추가되더라도 최종 데이터는 수동 확정 텍스트를 기준으로 한다

## 12.2 TTS

- 실시간 호출이 아니라 페이지별 사전 생성
- 텍스트 수정 시에만 재생성
- 부모 공통 프리셋을 기본으로 사용
- 책별 override는 필요한 경우에만 허용
- 자주 바꾸지 않는 voice 사용

## 12.3 녹음 파일

- 원본 음성은 장기 보관하지 않음
- 평가 완료 후 삭제 또는 짧은 TTL 적용

## 12.4 이미지/오디오 최적화

- 페이지 이미지는 `WebP` 또는 적절한 `JPEG`
- 오디오는 `MP3` 또는 `OGG`
- 페이지별로 너무 큰 해상도는 피함

## 12.5 PWA 캐시

- 현재 책
- 현재 페이지
- 다음 페이지
- 관련 오디오

이 정도만 캐시해도 체감 성능이 크게 좋아진다.

---

## 13. MVP 범위

### 포함

- 책 등록
- 페이지 이미지 업로드
- 페이지 순서 정렬
- 페이지별 텍스트 입력
- 전체 텍스트 일괄 붙여넣기
- 부모 공통 TTS 프리셋 선택
- TTS 샘플 미리듣기
- 페이지별 TTS 생성 및 저장
- 한 페이지 / 두 페이지 보기
- AI 읽기 하이라이트
- 아이 녹음
- 단어 단위 결과 표시

### 제외

- OCR 자동 입력
- 상세 부모 리포트
- 자동 난이도 추천
- 게임화 요소
- 고급 발음 코칭
- 오프라인 완전 동작

---

## 14. 단계별 개발 순서

## Phase 1. 기본 프로젝트 셋업

목표:

- Next.js 앱 생성
- Vercel 배포
- Supabase 연동
- PWA 기본 설정

산출물:

- 로그인 없는 기본 관리자 화면
- 설치 가능한 PWA 골격

## Phase 2. 책 업로드와 수동 텍스트 입력

목표:

- 책/페이지 등록
- 페이지 순서 관리
- 페이지별 텍스트 입력

산출물:

- 책 생성 화면
- 다중 페이지 업로드
- 페이지 정렬 UI
- 페이지 텍스트 편집기
- 전체 텍스트 붙여넣기 도구

## Phase 3. TTS와 하이라이트

목표:

- 페이지 오디오 생성
- 시간 정보 저장
- 재생 중 하이라이트
- 부모 공통 TTS 프리셋 적용

산출물:

- TTS 프리셋 선택 UI
- 음성 샘플 미리듣기
- `Generate TTS` 기능
- 오디오 재생
- 문장/단어 진행 표시

## Phase 4. 따라읽기 평가

목표:

- 아이 녹음
- Azure Pronunciation Assessment 호출
- 단어 수준 결과를 UI 상태로 매핑

산출물:

- 녹음 버튼
- 업로드 API
- pronunciation assessment 결과 저장
- 단어별 채점 UI

## Phase 5. 태블릿 UX/PWA 강화

목표:

- 캐시
- 설치성
- 오프라인 대비
- 화면 전환 다듬기

산출물:

- 홈 화면 설치
- 마지막 책 이어보기
- 자산 프리캐시

## Phase 6. 입력 자동화 확장 기능

목표:

- 수동 입력 흐름을 유지하면서 관리자 작업량을 줄인다

산출물:

- OCR 자동 초안 생성
- OCR 결과 검수 UI
- 선택적 로컬 OCR 보조 또는 Document AI 고도화

---

## 15. 가장 먼저 만들 것

바로 시작할 첫 작업은 아래 4가지다.

1. `books`, `book_pages`, `tts_profiles`, `page_tts_assets`, `reading_sessions` 스키마 정의
2. 관리자용 다중 페이지 업로드 + 페이지별 텍스트 입력 화면 구현
3. 부모 공통 TTS 프리셋 선택과 페이지 텍스트 확정 후 TTS 생성/저장 구조 구현
4. 단일 페이지 읽기 화면에서 하이라이트 프로토타입 구현

이 4개가 만들어지면 제품의 뼈대가 거의 완성된다.

---

## 16. 현재 시점 결론

이 프로젝트의 현재 최적 전략은 아래와 같다.

- UI와 배포는 `Vercel + Next.js PWA`
- 데이터와 파일은 우선 `Supabase`
- 책 등록은 수동 입력을 기본으로 시작
- TTS는 `Google Cloud Neural2`를 기본 엔진으로 사용
- 부모 공통 프리셋을 기본으로 하고 책별 override는 선택적으로만 허용
- TTS는 **실시간 호출이 아니라 사전 생성 후 저장**
- 아이 읽기 평가는 `Azure Pronunciation Assessment` 기반으로 구현
- OCR은 이후 입력 자동화 feature로 추가
- 저장 공간이 빨리 부족해지면 `Cloudflare R2`를 보조 스토리지로 검토

이 방향이 현재 요구사항과 비용, 배포 편의성, 태블릿 UX를 가장 균형 있게 만족한다.

---

## 17. 참고한 공식 문서

기준일: `2026-04-20`

- Google Cloud Vision pricing: https://cloud.google.com/vision/pricing
- Google Cloud Vision OCR guide: https://docs.cloud.google.com/vision/docs/ocr
- Google Cloud Document AI pricing: https://cloud.google.com/document-ai/pricing
- Google Cloud Speech-to-Text overview: https://docs.cloud.google.com/speech-to-text/docs/v1/speech-to-text-requests
- Google Cloud word timestamps: https://cloud.google.com/speech-to-text/docs/v1/async-time-offsets
- Google Cloud word confidence: https://cloud.google.com/speech-to-text/docs/word-confidence
- Google Cloud Text-to-Speech pricing: https://cloud.google.com/text-to-speech/pricing?hl=ko
- Google Cloud SSML marks/timepoints: https://cloud.google.com/text-to-speech/docs/ssml
- Azure Speech Pronunciation Assessment: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment
- Azure Pronunciation Assessment characteristics and limitations: https://learn.microsoft.com/en-us/legal/cognitive-services/speech-service/pronunciation-assessment/characteristics-and-limitations-pronunciation-assessment
- Supabase storage pricing: https://supabase.com/docs/guides/storage/management/pricing
- Supabase billing overview: https://supabase.com/docs/guides/platform/billing-on-supabase
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Vercel cron pricing/limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
