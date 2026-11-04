# 인스타 스킬 13종(instagram-agent-skill) 반영

작성 2026-11-01. 참고: 사용자가 보낸 릴스(「클로드가 인스타를 끝장냈다」, 28초)와 저장소 https://github.com/Jakeschincariol/instagram-agent-skill (MIT, 별 약 4,200개, 가입·API 키·계정 연결 없음).

## 1. 무엇인가
클로드용 무료 스킬 13개. **글과 계획만 만들고 게시는 사람이 한다**는 설계라 우리 규칙(자동 게시 금지, 수익 계정 보호)과 맞는다. 작성자도 「브라우저 자동화나 외부 도구로 게시·댓글·팔로우·DM 하면 인스타 이용약관 위반이고 계정이 막힐 수 있다」고 적어 두었다.

## 2. 13개 스킬과 우리 쪽 연결
| 스킬 | 하는 일 | 우리 쪽 | 쓰는 법·주의 |
| --- | --- | --- | --- |
| ig-reel | 아이디어 하나 → 후킹 3개(공식 26개로 점수) + 대본·화면 글자·초 단위 진행표 | reels-maker | **우리 26패턴·「내가 ○○ 안 하면 / ○○ 당해요」 규칙이 우선.** 스킬 점수는 참고만(작성자도 「좋은 후킹 중 무엇이 터질지는 못 맞힌다」고 함) |
| ig-viral | 내 분야 계정들의 릴스를 계정 평소 조회수 대비 몇 배인지로 순위, 어떤 후킹인지 표시 | trend-scout | **에이전트가 인스타를 읽지 않는다**(수익 계정 보호 규칙). 사람이 자기 브라우저로 본 숫자를 파일로 모으면, 스킬의 swipe.py 로 순위만 매긴다 |
| ig-plan | 이번 주 무엇을·언제·어떤 형식으로 + 소통할 계정 10개 | 캘린더 화면 | 캘린더 칸을 채우는 데 쓰고, 소통(댓글)은 사람이 직접 |
| ig-caption | 캡션 쓰기·점검, 「더 보기」 전 약 125자 미리보기 | 검수기 | 검수기에 경고 2개 추가: 해시태그 5개 초과(2025-12 인스타 변경), 캡션 첫 줄이 너무 짧음. 캡션 링크 금지는 그대로 |
| ig-dm | 키워드 자료 보내기·첫 인사·협업 제안·후속 DM 초안 | dm-funnel | 키워드 DM 은 인스타 자체 도구(댓글 단 사람에게만)로. 초안만 |
| ig-human | 사람 글처럼 다듬기(숨은 글자·상투 문구 제거, 5가지 점수) | style-checker | 영어 기준이라 한국어는 기존 「탈AI」 스킬(human-prose-ko)이 우선 |
| ig-audit | 지난 게시물을 조회수가 아니라 「도달 대비 공유」·평소 대비 몇 배로 돌아보기 | (새) insta-skills | 인사이트 숫자는 사람이 내보내 준 파일로 |
| ig-profile | 프로필 100점 채점(12항목) + 고칠 문장 | insta-skills | 프로필 대표 링크는 쿠팡 파트너스 하나(기존 규칙) |
| ig-reply | 내 게시물 답글 분류 + 답 초안 | insta-skills | 다는 건 사람 |
| ig-comment | 남의 게시물에 달 댓글 9가지 유형 초안 | insta-skills | 다는 건 사람 |
| ig-story | 하루 스토리 순서·스티커 역할·DM 유도 | insta-skills | 게시는 사람 |
| ig-repurpose | 영상·글 하나 → 한 주 치 릴스·카드뉴스 | reels-maker | 카드뉴스는 우리 사진 위주 양식(1080×1350) |
| ig-carousel | 카드뉴스 표지·장별 문구·1080×1350 그림 | 카드뉴스 | 그림은 Firefly, 맛집 등은 실제 사진(기존 규칙) |

## 3. 설치(사람이 PC에서 한 번)
작업 폴더(C:\dev\agent)의 프로젝트 스킬로 넣는다. `.claude/` 아래라 원격으로는 못 넣는다.
```
git clone https://github.com/Jakeschincariol/instagram-agent-skill E:\C_temp_archive\instagram-agent-skill
xcopy /E /I E:\C_temp_archive\instagram-agent-skill\skills C:\dev\agent\.claude\skills
```
- 먼저 `templates/voice.md`(내 말투)를 채운다. 모든 스킬이 읽는다. 본계정과 오정꿀 말투는 따로.
- 이름이 겹치는 스킬이 있으면 우리 스킬(reels-main·reels-ojeongkkul)이 우선이다.

## 4. 「Agent Hub」에 넣은 것
- 릴스 그룹에 `insta-skills`(「인스타 스킬 13종」, 예정).
- 검수기 경고: `caption_hashtags`(해시태그 5개 초과), `caption_preview`(캡션 첫 줄이 너무 짧음). 값은 `hub/rules.json` 의 `caption_hashtag_max`.
- 영상 끝의 「댓글 남기면 정리본 보내 드릴게요」는 docs/benchmark-dm-funnel.md 의 댓글→DM 흐름과 같은 방식.
