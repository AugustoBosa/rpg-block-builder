# Regras do repo

- **O graph é atualizado ANTES de todo commit** pelo hook `.git/hooks/pre-commit` (`graphify update . --force`, só AST, sem LLM). Não pular com `--no-verify`.
- Os hooks `post-commit` e `post-checkout` do graphify também estão instalados (`graphify hook status` para conferir; `graphify hook install` se faltar, p.ex. em clone novo — hooks não vão no git).
- `graphify-out/` está no `.gitignore`: o graph fica só local.
