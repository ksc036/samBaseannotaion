# samBaseannotaion

micro-sam 기반 point prompt segmentation 웹 프로토타입입니다.

브라우저에서 microscopy 이미지를 열고, positive / negative point를 찍은 뒤 `Segment Object`로 마스크를 생성하는 데 집중합니다.

## 기능

- TIFF/PNG/JPEG 이미지 업로드
- positive / negative point prompt
- micro-sam `vit_b_lm` 모델로 segmentation
- 원본 위 투명 overlay 표시
- 일반 이미지 뷰어에서 보이는 `0/255` mask 다운로드
- 1px edge mask 다운로드

## 설치

`micro_sam` 공식 문서는 conda 설치를 권장하며 macOS도 지원합니다. 이 프로젝트도 같은 방식을 따릅니다.

각 OS에서 설치와 실행을 분리했습니다.

- `setup_web_sam.*`: conda 환경 설치/업데이트
- `run_web_sam.*`: 앱 실행
- `launch_web_sam.*`: 기존 호환용 실행 래퍼

macOS / Linux / Windows 모두 `runtime.env`의 공통 설정을 사용합니다.

먼저 `conda` 또는 Miniforge가 필요합니다.

- Miniforge: https://conda-forge.org/download/

그다음 저장소 폴더에서 설치 스크립트를 실행합니다.

macOS / Linux:

```bash
chmod +x setup_web_sam.sh run_web_sam.sh launch_web_sam.sh launch_web_sam.command
./setup_web_sam.sh
```

Windows:

```text
setup_web_sam.bat
```

또는 PowerShell:

```powershell
.\setup_web_sam.ps1
```

수동 설치를 원하면 아래처럼 직접 만들어도 됩니다.

```bash
conda env create -f environment.yml
conda activate sambaseannotation
```

이미 `micro_sam`, `imageio`, `numpy`, `scipy`가 들어 있는 conda 환경이 있다면 그 환경을 사용해도 됩니다.

## 실행

설치가 끝났으면 실행 스크립트를 사용합니다.

macOS / Linux:

```bash
./run_web_sam.sh
```

Finder에서 더블클릭으로 실행하려면:

```text
launch_web_sam.command
```

Windows:

```text
run_web_sam.bat
```

또는 PowerShell:

```powershell
.\run_web_sam.ps1
```

브라우저 주소:

```text
http://localhost:8765
```

## 사용법

1. `Open image`로 이미지 선택
2. `Positive` 또는 `Negative` 선택
3. 이미지 위에 점 클릭
4. `Segment Object` 클릭
5. 결과 확인
6. 결과 확인 및 검토

## 주의

- 기본 모델은 `vit_b_lm`, 기본 장치는 `cpu`입니다.
- 첫 이미지 업로드 시 모델 로딩과 embedding 계산 때문에 시간이 걸릴 수 있습니다.
- GPU를 쓰려면 `web_app.py`의 `DEFAULT_DEVICE`를 `cuda`로 바꾸고 CUDA PyTorch 환경을 구성해야 합니다.
- 모델 checkpoint는 처음 실행 시 micro-sam 캐시에 다운로드됩니다.
- macOS Apple Silicon에서도 CPU 실행은 가능하지만 첫 로딩은 느릴 수 있습니다.
- `micro_sam is not installed` 오류가 나오면 `conda activate sambaseannotation` 후 다시 실행하세요.
- `runtime.env`에서 공통 환경 이름, 호스트, 포트를 바꿀 수 있습니다.
