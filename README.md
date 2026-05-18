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

Miniforge 또는 conda가 설치되어 있다고 가정합니다.

```powershell
conda env create -f environment.yml
```

이미 `micro-sam` 환경이 있다면 다시 만들 필요 없습니다.

## 실행

Windows에서는 더블클릭:

```text
launch_web_sam.bat
```

또는 PowerShell:

```powershell
.\launch_web_sam.ps1
```

브라우저에서 열기:

```text
http://127.0.0.1:8765
```

## 사용법

1. `Open image`로 이미지 선택
2. `Positive` 또는 `Negative` 선택
3. 이미지 위에 점 클릭
4. `Segment Object` 클릭
5. 결과 확인
6. `Mask 255` 또는 `Edge 1px` 다운로드

## 주의

- 기본 모델은 `vit_b_lm`, 기본 장치는 `cpu`입니다.
- 첫 이미지 업로드 시 모델 로딩과 embedding 계산 때문에 시간이 걸릴 수 있습니다.
- GPU를 쓰려면 `web_app.py`의 `DEFAULT_DEVICE`를 `cuda`로 바꾸고 CUDA PyTorch 환경을 구성해야 합니다.
- 모델 checkpoint는 처음 실행 시 micro-sam 캐시에 다운로드됩니다.
