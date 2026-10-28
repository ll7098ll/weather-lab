# 배포 안내

[README로 돌아가기](../README.md) · [GitHub 업로드 안내](GITHUB_UPLOAD.md)

## 배포 대상

웹사이트에 필요한 파일은 모두 `dist/`에 있습니다. 별도 빌드 없이 `dist/`의 내용을 웹 루트로 제공하면 됩니다. `docs/`는 프로젝트 설명용 문서 폴더입니다.

현재 파일 경로는 상대 경로라 저장소 이름이 붙는 하위 경로에서도 사용할 수 있습니다. ES 모듈을 위해 `.js`와 `.mjs`를 JavaScript MIME 형식으로 제공하는 정적 호스팅을 사용합니다.

## GitHub Pages

포함된 [Pages 워크플로](../.github/workflows/pages.yml)는 수동 실행 시 Node.js 24에서 테스트를 수행하고, 통과하면 `dist/`를 업로드해 Pages로 배포합니다. 파일 업로드나 push만으로는 실행되지 않습니다.

1. 업로드한 저장소에서 **Settings → Pages**를 엽니다.
2. **Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
3. **Actions** 탭에서 **Deploy Weather Lab to Pages**를 선택합니다.
4. **Run workflow**를 눌러 배포할 브랜치에서 실행합니다. 처음 실행할 때는 워크플로 파일이 기본 브랜치에 있어야 합니다.
5. 성공 후 워크플로의 `github-pages` 환경에 표시되는 주소를 엽니다.

게시 방식 선택은 [GitHub Pages 공식 설정 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), 권한·업로드·배포 단계는 [공식 사용자 지정 워크플로 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)를 기준으로 구성했습니다.

프로젝트 저장소의 기본 주소 형식은 `https://계정.github.io/저장소이름/`입니다. 실제 배포 주소는 GitHub가 표시하는 값을 사용합니다. 업데이트한 내용도 다시 **Run workflow**를 실행해야 반영됩니다.

## 일반 정적 호스팅

| 설정 | 값 |
| --- | --- |
| 빌드 명령 | 없음 |
| 배포·출력 폴더 | `dist` |
| 진입 파일 | `index.html` |
| 환경 변수·API 키 | 필요 없음 |
| 서버 프로세스 | 필요 없음 |

호스팅 서비스가 폴더의 내용 업로드를 요구한다면 `dist` 폴더 자체가 아닌 **안의 파일과 `vendor/` 폴더**를 올립니다. `server.mjs`는 로컬 확인용이므로 정적 호스팅에서 실행하지 않습니다.

## 배포 확인과 문제 해결

- 사이트 주소에서 세 실험을 선택하고 3D 모형과 그래프가 나오는지 확인합니다.
- `app.js`, `.mjs` 파일, `style.css`, `vendor/` 요청에 404가 없는지 확인합니다.
- 관찰 기록을 만든 뒤 새로고침과 CSV 내려받기를 확인합니다.

| 증상 | 원인과 조치 |
| --- | --- |
| 사이트에 README만 보임 | 정적 배포 경로가 저장소 루트로 잡혔을 수 있으므로 `dist/`를 게시하는지 확인 |
| Pages에서 `/dist` 폴더를 고를 수 없음 | 브랜치 방식의 폴더 선택은 루트 또는 `/docs`이므로 제공된 Actions 방식을 사용 |
| 모듈 MIME 오류 | 호스팅의 `.mjs` 응답을 `text/javascript` 또는 `application/javascript`로 설정 |
| Pages 워크플로 실패 | Pages Source, 저장소 Actions 허용 정책, `github-pages` 환경의 브랜치 규칙과 실행 로그 확인 |
| 배포 후 예전 관찰 노트가 안 보임 | 브라우저 저장소는 사이트 주소별로 나뉘므로 이전 주소에서 CSV로 내려받아 보관 |

GitHub Actions의 원격 실행과 실제 공개 주소 접속은 업로드 후에 확인해야 합니다. 패키지 준비 단계에서는 로컬 테스트와 정적 파일 제공을 확인했습니다.
