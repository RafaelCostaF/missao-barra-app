# Commits

**Sempre fazer commit e push** ao terminar cada mudança (testes passando), direto na `main`. Não precisa pedir confirmação.

## Mensagem

Curta e direta, em português, dizendo **a principal mudança** — dá para entender só olhando o `git log --oneline`.

- Uma linha, até ~60 caracteres, começando pelo que mudou para quem usa.
- Uma mudança principal por commit; detalhes (se precisar) no corpo, depois de uma linha em branco.
- Nunca subir segredos (`supabase/.env*` são ignorados).

Bons exemplos:

```
Corredor vê pace, km até o próximo ponto e quem está perto
Strava grátis: link do perfil com consentimento
Painel: página Pessoas com filtros e permissão de organizador
```

Evitar: `ajustes`, `update`, `várias melhorias`, mensagens longas listando tudo.
