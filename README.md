# samBaseannotaion

micro-sam 기반 microscopy annotation 웹 도구입니다.  
macOS와 Linux 기준으로만 실행 파일을 정리했습니다.

## 핵심 파일

- [setup_web_sam.sh](/Users/ksc/Downloads/samBaseannotaion/setup_web_sam.sh)
  conda/Miniforge 설치 확인, 없으면 Miniforge 자동 설치, conda 환경 생성/업데이트
- [run_web_sam.sh](/Users/ksc/Downloads/samBaseannotaion/run_web_sam.sh)
  앱 실행
- [launch_web_sam.command](/Users/ksc/Downloads/samBaseannotaion/launch_web_sam.command)
  macOS Finder 더블클릭 실행용
- [runtime.env](/Users/ksc/Downloads/samBaseannotaion/runtime.env)
  공통 설정 파일

## 설치

프로젝트 루트에서 한 번만 실행하면 됩니다.

```bash
chmod +x setup_web_sam.sh run_web_sam.sh launch_web_sam.command
./setup_web_sam.sh
```

설치 스크립트는 다음을 자동으로 처리합니다.

- conda 확인
- conda가 없으면 Miniforge 설치
- `sambaseannotation` 환경 생성 또는 업데이트

기본 Miniforge 설치 경로는 `~/miniforge3`입니다.

## 실행

터미널에서 실행:

```bash
./run_web_sam.sh
```

macOS Finder에서 실행:

```text
launch_web_sam.command
```

브라우저 주소:

```text
http://localhost:8765
```

## 설정

[runtime.env](/Users/ksc/Downloads/samBaseannotaion/runtime.env)에서 공통 설정을 바꿀 수 있습니다.

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
- 모델 checkpoint는 처음 실행 시 micro-sam 캐시에 다운로드됩니다.
- GPU를 쓰려면 [web_app.py](/Users/ksc/Downloads/samBaseannotaion/web_app.py)의 `DEFAULT_DEVICE`와 PyTorch CUDA 환경을 따로 맞춰야 합니다.
