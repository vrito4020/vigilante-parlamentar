# PROMPT MESTRE DE EXECUÇÃO: EXPANSÃO DO MOTOR FORENSE (VIGILANTE PARLAMENTAR)

Você é o Arquiteto de Software e Engenheiro de Dados Forenses líder do projeto **Vigilante Parlamentar**.
Seu objetivo é integrar novas bases públicas ao ecossistema existente (FastAPI + React/Tailwind + SQLite + Docker) para elevar o motor de auditoria cívica a um patamar investigativo de padrão Ministério Público e Polícia Federal.

---

## 🎯 OBJETIVOS DA IMPLEMENTAÇÃO

### 1. Módulo CGU / CEIS / CNEP (Empresas Sancionadas e Inidôneas)
- **Fonte:** API do Portal da Transparência da CGU (`https://api.portaldatransparencia.gov.br/api-de-dados/ceis` e `/cnep`).
- **Lógica Forense:** Cruzar todo CNPJ constante nas notas fiscais da CEAP com a base de dados do CEIS (Cadastro de Empresas Inidôneas e Suspensas) e CNEP (Cadastro Nacional de Empresas Punidas).
- **Gatilho de Alerta:**
  - Severidade: **CRÍTICA (ALTA - Peso 50 pts)**
  - Descrição: *"Fornecedor contratado com cota parlamentar está formalmente proibido de licitar e contratar com o Poder Público por atos de corrupção ou fraude."*

### 2. Módulo Folha de Gabinete da Câmara (Secretários Parlamentares & Nepotismo Cruzado)
- **Fonte:** Endpoint `/deputados/{id}/ocupantes-cargos` ou dados abertos de pessoal da Câmara.
- **Lógica Forense:**
  - Cruzar a lista de nomes e CPFs parciais dos assessores nomeados no gabinete com o array `qsa` (Quadro de Sócios e Administradores) da Receita Federal coletado via BrasilAPI.
  - Detectar **autocontratação de assessores** e **empresas de assessores prestando serviços de consultoria** para a mesma cota que custeia seus salários.
- **Gatilho de Alerta:**
  - Severidade: **ALTA (Peso 45 pts)**
  - Descrição: *"Sócio ou administrador da empresa contratada exerce cargo comissionado (Secretário Parlamentar) no gabinete do próprio deputado contratante."*

### 3. Módulo Doações Eleitorais TSE vs. Fornecedores CEAP (Retorno de Campanha / Quid Pro Quo)
- **Fonte:** Repositório de Dados Eleitorais do TSE (Doações de Campanha / Prestação de Contas).
- **Lógica Forense:**
  - Identificar fornecedores que foram grandes doadores da campanha eleitoral do parlamentar e que, após a posse, passam a receber pagamentos recorrentes da cota parlamentar com margens suspeitas.
- **Gatilho de Alerta:**
  - Severidade: **MÉDIA/ALTA (Peso 35 pts)**
  - Descrição: *"Fornecedor contratado via CEAP foi doador direto de campanha eleitoral do parlamentar, caracterizando indício de favorecimento ou restituição com verba pública."*

### 4. Módulo TCU (Contas Julgadas Irregulares e Inabilitados)
- **Fonte:** API de Contas Irregulares do Tribunal de Contas da União.
- **Lógica Forense:** Cruzar CPFs de parlamentares e CNPJs de fornecedores para detectar se já possuem condenação por desfalque ou desvio de verba pública com trânsito em julgado administrativo.

---

## 🛠️ ARQUITETURA TÉCNICA E ETAPAS

1. **Backend (`backend/`):**
   - Criar `backend/integracoes/cgu.py` com cliente assíncrono para CEIS/CNEP.
   - Criar `backend/integracoes/pessoal_camara.py` para sincronizar secretários de gabinete.
   - Expandir `backend/models.py` com tabelas: `SancaoFornecedor`, `AssessorGabinete`, `DoacaoCampanha`.
   - Implementar as novas heurísticas em `backend/heuristicas.py`.
2. **Frontend (`frontend/`):**
   - Adicionar badge vermelho piscante de **"Empresa Sancionada / Inidônea (CEIS/CGU)"** no dossiê do deputado e na lista de notas.
   - Adicionar aba **"Vínculos de Gabinete & Nepotismo"** no perfil do parlamentar com organograma interativo.
3. **Deploy Automatizado:**
   - Versionar no Git, testar build do Vite e rodar `docker compose up -d --build` na VPS Hostinger (`vigilante.187.77.237.245.sslip.io`).
