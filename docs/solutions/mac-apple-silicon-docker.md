# Mac Apple Silicon Docker Notes

## Context

Docker Desktop on Apple Silicon defaults builds to `linux/arm64`. The `micro_sam`
conda environment did not solve on `linux/arm64` because some transitive packages
were unavailable for that platform.

## Resolution

Set the compose service to `platform: linux/amd64` so Docker Desktop uses the same
package platform as the Linux server deployment target.

Under amd64 emulation, LLVM OpenMP can crash during startup with:

```text
OMP: Error #13: Assertion failure at kmp_affinity.cpp
```

Set `KMP_AFFINITY=disabled` and keep `OMP_NUM_THREADS=1` in the container
environment to avoid the affinity detection crash.
