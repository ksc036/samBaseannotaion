FROM mambaorg/micromamba:1.5.10

WORKDIR /app

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yml /tmp/environment.yml
RUN micromamba create -y -f /tmp/environment.yml \
  && micromamba clean --all --yes

COPY --chown=$MAMBA_USER:$MAMBA_USER . /app
RUN chmod +x /app/docker-entrypoint.sh

ENV APP_HOST=0.0.0.0
ENV APP_PORT=8765
ENV PYTHONUNBUFFERED=1
ENV XDG_CACHE_HOME=/app/model_cache
ENV TORCH_HOME=/app/model_cache/torch
ENV MPLCONFIGDIR=/app/model_cache/matplotlib

EXPOSE 8765

USER root

ENTRYPOINT ["/app/docker-entrypoint.sh"]
