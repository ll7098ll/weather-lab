# GitHub 업로드 안내

[README로 돌아가기](../README.md)

## 준비된 폴더

`weather-lab-github`는 GitHub 저장소의 최상위에 넣을 파일을 모아 둔 업로드용 폴더입니다. 같은 이름의 ZIP도 제공하며, ZIP을 사용할 때는 먼저 압축을 풉니다.

**폴더 안의 내용 전체를 저장소 최상위에 올립니다.** 업로드 후 저장소를 열었을 때 `README.md`, `package.json`, `dist/`, `tests/`, `docs/`가 바로 보여야 합니다. ZIP 파일만 올리면 프로젝트 파일과 README가 펼쳐지지 않습니다.

복사본에는 실행 소스, 테스트, 문서, 화면 예시, `.gitignore`, `.gitattributes`, `.github/workflows/pages.yml`을 포함했습니다. 기존 `.git/` 이력과 `.openai/` 호스팅 설정, 과거 배포 압축파일, 점검용 폴더는 포함하지 않았습니다.

## 방법 1. 웹에서 파일 올리기

1. GitHub에서 새 저장소를 만듭니다. 이름 예시는 `weather-lab`입니다.
2. 공개 범위를 선택합니다. 준비된 파일을 그대로 올리려면 README·`.gitignore`·라이선스 자동 생성은 선택하지 않고 빈 저장소로 시작합니다.
3. 빈 저장소의 `uploading an existing file` 링크 또는 기존 저장소의 **Add file → Upload files**를 엽니다.
4. `weather-lab-github`를 열고 그 안의 파일과 폴더를 업로드 영역에 끌어다 놓습니다.
5. 업로드 목록을 살펴본 뒤 커밋 메시지 예시 `Add Weather Lab source and documentation`으로 저장합니다.
6. 저장소 첫 화면에서 README의 설명·이미지·문서 링크를 확인합니다.

파일 탐색기에서 **보기 → 표시 → 숨긴 항목**을 켜고 점으로 시작하는 파일과 `.github` 폴더도 함께 선택합니다. 브라우저에서 이 항목이 빠지면 Git 방식으로 올릴 수 있습니다. 웹 파일 업로드 절차는 [GitHub 공식 안내](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)를 기준으로 작성했습니다.

## 방법 2. Git으로 올리기

Git이 설치된 환경에서 GitHub에 빈 저장소를 먼저 만듭니다. 터미널의 현재 폴더를 **업로드용 `weather-lab-github` 폴더 안**으로 이동한 뒤 실행합니다.

아래 예시는 새 복사본을 처음 올리는 절차이며, `YOUR_GITHUB_USERNAME`은 실제 계정으로 바꿉니다. 저장소 이름을 다르게 만들었다면 URL의 `weather-lab`도 바꿉니다.

```powershell
git init
git branch -M main
git add .
git status --short
git commit -m "Add Weather Lab source and documentation"

$GitHubUser = 'YOUR_GITHUB_USERNAME'
git remote add origin "https://github.com/$GitHubUser/weather-lab.git"
git push -u origin main
```

GitHub 로그인과 원격 주소 인증은 사용자의 환경에서 처리합니다. 원래 개발 폴더가 아닌 새 업로드 폴더에서 실행하므로 기존 프로젝트의 Git 이력과 원격 설정에 영향을 주지 않습니다. 이미 파일이 있는 원격 저장소에 추가할 때는 해당 저장소를 먼저 clone하고 그 안에 업로드 파일을 복사하는 편이 안전합니다.

새 저장소 생성 옵션은 [GitHub 공식 저장소 생성 안내](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)에서 확인할 수 있습니다.

## 업로드 후 확인

- [ ] `README.md`와 `package.json`이 저장소 최상위에 있다.
- [ ] README의 두 화면 예시와 문서 링크가 열린다.
- [ ] `dist/vendor/`의 모듈과 `THREE-LICENSE.txt`가 포함되어 있다.
- [ ] `dist/`가 통째로 업로드되어 있다.
- [ ] `.github/workflows/pages.yml`, `.gitignore`, `.gitattributes`가 포함되어 있다.
- [ ] 저장소를 새로 내려받아 `npm test`와 `npm start`를 실행할 수 있다.

웹사이트를 공개하려면 파일 업로드 후 [배포 안내](DEPLOYMENT.md)를 따릅니다. 포함된 Pages 워크플로는 수동 실행 방식이므로 파일을 올리는 것만으로 사이트를 배포하지 않습니다.
