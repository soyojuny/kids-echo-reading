# Child Reading State Machine

## Purpose
- 읽기 화면의 상태 전이를 명시해서 구현 기준을 통일한다.

## States
- `idle`: 문장 준비 상태
- `ai_playing`: AI가 문장 전체 읽기
- `child_recording`: 아이가 문장 전체 따라 읽기
- `sentence_retry_prompt`: 남은 단어 재시도 유도
- `sentence_done`: 문장 완료
- `page_review`: 페이지 남은 단어 복습
- `page_transition_wait`: 자동 페이지 전환 대기
- `final_review`: AI 추천 복습 화면

## Transition
1. `idle -> ai_playing`
2. `ai_playing -> child_recording`
3. `child_recording -> sentence_done` (모든 단어 mastered)
4. `child_recording -> sentence_retry_prompt` (남은 단어 존재)
5. `sentence_retry_prompt -> ai_playing` (재시도)
6. `sentence_done -> ai_playing` (다음 문장 존재)
7. `sentence_done -> page_review` (문장은 끝났지만 페이지 복습 필요)
8. `sentence_done -> page_transition_wait` (페이지 완료, 자동 전환)
9. `page_review -> ai_playing` (복습 재개)
10. `page_transition_wait -> ai_playing` (다음 페이지)
11. `page_transition_wait -> final_review` (책 완료)

## Timers
- 문장 성공 후 자동 다음 문장: `2s`
- 페이지 완료 후 자동 다음 페이지: `5s`
- 재시도 프롬프트 대기: 짧게(`~1s`)

## Manual Override
- `다음 문장/페이지` 버튼: 즉시 이동
- `이전 문장` 버튼: 즉시 이동
- `중지` 버튼: 현재 자동 루프 중단
