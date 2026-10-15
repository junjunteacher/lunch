# 급식쪽지 — made by junjunT

오늘 급식과 학사일정을 바탕화면 포스트잇으로 보여주는 설치형 프로그램 (Electron).
서버 없음 · 앱이 NEIS 개방포털 API에 직접 요청 · 인증키는 내 PC에만 저장.

## 개발
```
npm install
npm start
```
## 배포
```
npm run dist        # release/ 폴더에 exe(설치형+포터블)/dmg/AppImage
git tag v1.0.0 && git push --tags   # GitHub Actions가 3개 OS 빌드 후 Release에 첨부
```
## 사용
1. 처음 실행 → 설정 창 → **인증키** 탭에 NEIS 인증키 입력
2. **학교** 탭에서 학교 검색 후 선택 → 저장
3. 트레이 아이콘 클릭으로 보이기/숨기기, 자정마다 자동 갱신
