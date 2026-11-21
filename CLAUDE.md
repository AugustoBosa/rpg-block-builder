# Regras do repo

- **O graph é atualizado ANTES de todo commit** pelo hook `.git/hooks/pre-commit` (`graphify update . --force`, só AST, sem LLM). Não pular com `--no-verify`.
- Depois do update, o mesmo hook nomeia as comunidades com **Haiku** em background: `GRAPHIFY_CLAUDE_CLI_MODEL=haiku graphify label . --backend=claude-cli --missing-only` (usa o login do `claude` CLI, sem API key). Log: `~/.cache/graphify-label.log`.
- Os hooks `post-commit` e `post-checkout` do graphify também estão instalados (`graphify hook status` para conferir; `graphify hook install` se faltar, p.ex. em clone novo — hooks não vão no git).
- `graphify-out/` está no `.gitignore`: o graph fica só local.
