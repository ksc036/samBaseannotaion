# samBaseannotaion

micro-sam 기반 microscopy annotation 웹 도구입니다.  
macOS와 Linux 기준으로만 실행 파일을 정리했습니다.

## 핵심 파일

- [docker-compose.yml](/Users/ksc/Downloads/samBaseannotaion/docker-compose.yml)
  운영 기본 실행 파일
- [Dockerfile](/Users/ksc/Downloads/samBaseannotaion/Dockerfile)
  CPU 전용 앱 이미지 정의
- [setup_web_sam.sh](/Users/ksc/Downloads/samBaseannotaion/setup_web_sam.sh)
  개발/진단용 conda 환경 설치
- [run_web_sam.sh](/Users/ksc/Downloads/samBaseannotaion/run_web_sam.sh)
  개발/진단용 로컬 실행
- [runtime.env](/Users/ksc/Downloads/samBaseannotaion/runtime.env)
  로컬 shell 실행용 설정 파일

## Docker 실행

운영 환경에서는 Docker Compose를 기본으로 사용합니다.

```bash
docker compose build
docker compose up -d
```

브라우저 주소:

```text
http://localhost:8765
```

LAN에서 접근하려면:

```text
http://<서버IP>:8765
```

로그 확인:

```bash
docker compose logs -f
```

중지:

```bash
docker compose down
```

`docker-compose.yml`에는 `restart: unless-stopped`가 설정되어 있습니다. Docker 자체가 부팅 시 시작되도록 설정되어 있으면 서버 재시작 후에도 컨테이너가 자동으로 다시 올라옵니다.

## 저장 데이터

아래 폴더는 host 프로젝트 폴더에 그대로 남습니다.

```text
web_uploads/
annotation_complete/
deleted_annotations/
logs/
model_cache/
```

컨테이너를 삭제하거나 다시 빌드해도 위 데이터와 모델 cache는 유지됩니다.

## 로컬 shell 실행

Docker 문제 진단이나 개발용으로 기존 shell 실행도 남겨둡니다.

```bash
chmod +x setup_web_sam.sh run_web_sam.sh
./setup_web_sam.sh
./run_web_sam.sh
```

[runtime.env](/Users/ksc/Downloads/samBaseannotaion/runtime.env)는 shell 실행에서 사용하는 설정입니다.

```env
APP_ENV_NAME=sambaseannotation
APP_HOST=0.0.0.0
APP_PORT=8765
APP_ENTRY=web_app.py
```

## 사용 흐름

1. `Open image`로 이미지 업로드
2. 필요하면 patch ROI 생성
3. `Positive` / `Negative` 포인트 지정
4. `Segment Object` 또는 `Brush` / `Eraser`로 마스크 수정
5. `Calculate`로 측정값 계산
6. 선택한 결과를 `xlsx`로 내보내기

## 참고

- 기본 모델은 `vit_b_lm`, 기본 장치는 `cpu`입니다.
- 첫 이미지 업로드 시 모델 로딩 때문에 시간이 걸릴 수 있습니다.
- 모델 checkpoint는 처음 실행 시 `model_cache/` 아래에 다운로드됩니다.
- GPU를 쓰려면 [web_app.py](/Users/ksc/Downloads/samBaseannotaion/web_app.py)의 `DEFAULT_DEVICE`와 PyTorch CUDA 환경을 따로 맞춰야 합니다.
