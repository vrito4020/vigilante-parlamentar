# 🛡️ Vigilante Parlamentar - Documento de Contexto para Engenharia de Prompts (IA)

> **Instrução para a IA que vai ler este arquivo:**  
> Use as informações deste dossiê técnico para gerar prompts detalhados, estruturados e passo a passo para o assistente **Antigravity**.  
> O Antigravity já possui acesso direto ao terminal (PowerShell no Windows), editor de arquivos e ao ambiente de execução local deste projeto.

---

## 📌 1. Visão Geral do Projeto
O **Vigilante Parlamentar** é uma plataforma de auditoria cívica automatizada e detecção forense de inconformidades nos gastos públicos da **Cota para o Exercício da Atividade Parlamentar (CEAP)** dos 513 deputados federais do Brasil.

O sistema cruza dados oficiais em tempo real de 3 fontes públicas:
1. **Câmara dos Deputados (API Aberta):** Extração sob demanda de notas fiscais, recibos, tipos de despesas e links originais dos comprovantes em PDF.
2. **Receita Federal do Brasil (via BrasilAPI):** Verificação cadastral de CNPJs (Razão Social, Situação Ativa/Baixada/Inapta, Data de Fundação, Opção por MEI, Capital Social e CNAE).
3. **Tribunal Superior Eleitoral - TSE (DivulgaCandContas 2022):** Consulta do patrimônio oficial declarado na última eleição para cruzar evolução de bens versus gastos e atuação pública.

---

## 🏗️ 2. Arquitetura e Stack Tecnológica

### Backend
* **Linguagem:** Python 3.10+ / 3.12 (Ambiente virtual em `backend/venv`)
* **Framework:** FastAPI com CORS liberado
* **ORM & Banco:** SQLAlchemy + SQLite (`backend/vigilante.db`)
* **Servidor:** Uvicorn (`127.0.0.1:8000`)
* **Dependências principais:** `fastapi`, `uvicorn`, `sqlalchemy`, `httpx`, `pydantic`

### Frontend
* **Framework:** React 19 + Vite 8
* **Estilização:** Tailwind CSS v3.4 (Design moderno, limpo, paleta slate/blue/emerald/amber/red)
* **Visualização de Dados:** Recharts v3 (Gráficos interativos responsivos)
* **Ícones:** Lucide React
* **Roteamento & HTTP:** React Router DOM v7, Axios
* **Servidor Dev:** `http://localhost:5173/`

---

## 📂 3. Estrutura do Código-Fonte

```text
vigilante-parlamentar/
├── backend/
│   ├── main.py             # Endpoints REST e agregações de dashboard
│   ├── models.py           # Modelos SQLAlchemy (Deputado, Fornecedor, DespesaCEAP, Alerta)
│   ├── schemas.py          # Schemas Pydantic para validação e serialização
│   ├── database.py         # Conexão SQLite e SessionLocal
│   ├── pipeline.py         # Extratores de dados (Câmara, BrasilAPI/QSA e TSE com cache UF)
│   ├── heuristicas.py      # Motor forense v6 com 21 heurísticas e filtros anti-falso positivo
│   └── vigilante.db        # Banco SQLite com 512 deputados e centenas de notas auditadas
│
└── frontend/
    ├── src/
    │   ├── App.jsx         # Configuração de rotas principais
    │   ├── components/
    │   │   ├── Navbar.jsx  # Barra de navegação com links ativos
    │   │   └── Footer.jsx  # Rodapé com aviso legal obrigatório
    │   └── pages/
    │       ├── Home.jsx            # Painel com KPIs, gráficos analíticos e ranking paginado
    │       ├── DeputadoProfile.jsx # Dossiê individual, gráficos temporais e botão de auditoria
    │       └── Metodologia.jsx     # Documentação detalhada das 21 fórmulas forenses
    ├── package.json
    └── tailwind.config.js
```

---

## ⚙️ 4. Endpoints da API Disponíveis

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/dashboard/stats` | Contadores gerais: total de deputados, total de alertas, empresas fantasmas e risco médio da Câmara. |
| `GET` | `/api/dashboard/charts` | Dados consolidados para gráficos: Top fornecedores, categorias de despesa, heurísticas frequentes, severidade e volume auditado. |
| `GET` | `/api/deputados` | Lista todos os parlamentares ordenados pelo `indice_risco` decrescente. |
| `GET` | `/api/deputados/{id}` | Retorna detalhes do deputado, histórico e lista de alertas gerados com link para o PDF da nota fiscal. |
| `GET` | `/api/deputados/{id}/analytics` | Dados analíticos do deputado: evolução mensal mês a mês (`AreaChart`), categorias individuais (`PieChart`) e Top 5 fornecedores (`BarChart`). |
| `POST` | `/api/deputados/{id}/analisar` | Dispara o pipeline completo sob demanda (baixa despesas da Câmara, consulta CNPJs na BrasilAPI, busca patrimônio no TSE e roda o motor de heurísticas). |
| `POST` | `/api/deputados/{id}/atualizar-patrimonio` | Atualiza especificamente os dados patrimoniais do TSE para o deputado. |

---

## 🧠 5. O Motor Forense (14 Heurísticas em `heuristicas.py`)

O motor analisa as despesas e emite alertas com pontuações de risco (0 a 100), prevenindo rigorosamente falsos positivos:

1. **Teletransporte Espaço-Temporal:** Notas emitidas com diferença menor que 4h em municípios a mais de 800 km de distância sem tempo físico hábil de locomoção.
2. **Empresa Fantasma / Inapta / Baixada:** Notas fiscais emitidas por CNPJs cuja situação cadastral na Receita Federal é BAIXADA, SUSPENSA ou NULA.
3. **Empresa Recém-Criada:** Fornecedores abertos menos de 90 dias antes da data de emissão da nota fiscal parlamentar.
4. **Estouro de Faturamento de MEI:** Microempreendedor Individual recebendo repasses acumulados que superam o limite legal proporcional (R$ 81.000/ano ou R$ 50.000 acumulado na cota).
5. **Monopólio Setorial:** Fornecedor único abocanhando mais de 30% de todo o orçamento da cota daquele parlamentar (com isenção automática para concessionárias públicas de energia/água).
6. **Abastecimento Excessivo de Combustível:** Cupom de abastecimento em posto único superior a R$ 600,00 ou volume mensal anormal (> R$ 2.000,00) incompatível com tanque de veículo convencional.
7. **Fracionamento Suspeito de Despesa:** Múltiplas notas emitidas para o mesmo fornecedor no mesmo dia ou com valores repetidos logo abaixo do limite de licitação.
8. **Gastos Concorrentes na Mesma Data:** Despesas presenciais em cidades diferentes na mesma data (alimentação, hospedagem simultânea).
9. **Discrepância Patrimonial:** Deputados com evolução de risco e patrimônio declarado oficial no TSE elevado com grandes volumes de cota sem justificativa econômica.
10. **Proteção Anti-Falso Positivo:** Concessionárias de energia elétrica (ex: Enel, Equatorial, CPFL) e companhias aéreas com bilhetes emitidos via agência corporativa Câmara não disparam alertas indevidos de monopólio ou notas zeradas.

---

## 🎨 6. Gráficos Analíticos Já Implementados

### No Painel Geral (`Home.jsx`):
1. **Top Fornecedores por Faturamento:** Gráfico de barras horizontais (`BarChart`) com os maiores recebedores da Câmara, Tooltip customizado com Razão Social completa, CNPJ e quantidade de notas fiscais.
2. **Distribuição por Categoria (CEAP):** Gráfico Donut (`PieChart`) com as fatias de gastos (Passagens, Escritório, Veículos, Combustíveis, etc.) e legenda com percentuais.
3. **Incidência de Anomalias:** Frequência de ocorrência de cada fórmula algorítmica.
4. **Classificação por Severidade:** Donut chart com a proporção de alertas de Alta (Vermelho), Média (Âmbar) e Baixa (Azul).
5. **Volume Financeiro Auditado:** Card superior com o montante financeiro monitorado em tempo real.

### No Dossiê Individual (`DeputadoProfile.jsx`):
1. **Cards de Resumo Financeiro:** Total Gasto, Média Mensal, Maior Nota Emitida e Quantidade de Documentos.
2. **Evolução Mensal dos Gastos:** Gráfico de Área (`AreaChart`) com gradiente azul temporal.
3. **Gastos por Categoria do Parlamentar:** Gráfico Donut individual.
4. **Maiores Fornecedores do Deputado:** Ranking dos 5 maiores contratados por esse parlamentar.
5. **Acesso Direto à Prova:** Botão de 1 clique que abre o PDF original da nota fiscal no site da Câmara dos Deputados.

---

## 🚀 7. Ideias de Próximas Funcionalidades para Prompts Futuros

A outra IA pode usar esta lista para elaborar prompts de alta qualidade para o Antigravity implementar:

1. **Exportação de Dossiê em PDF (Relatório de Denúncia):**
   * Gerar um relatório formal com carimbo de data/hora, lista de notas suspeitas, links de comprovantes e CNPJs para ser protocolado diretamente no Ministério Público Federal (MPF), TCU ou Conselho de Ética da Câmara.
2. **Comparador Lado a Lado de 2 Deputados:**
   * Uma página `/comparador` onde o usuário seleciona 2 deputados federais e o sistema compara gastos mês a mês, índice de risco, patrimônio e despesas com fornecedores em gráficos sobrepostos.
3. **Filtros Avançados no Painel:**
   * Filtrar o ranking geral por Estado (UF), Partido Político ou Faixa de Risco (ex: apenas > 50 pontos).
4. **Resumos Investigativos com IA (Gemini):**
   * Endpoint que recebe os alertas do deputado e gera um texto explicativo em linguagem jornalística/cívica resumindo as suspeitas encontradas.
5. **Mapa Interativo do Brasil (Geolocalização):**
   * Mapa de calor dos estados brasileiros coloridos de acordo com o risco médio ou volume de cota gasto por estado.

---

## 💡 8. Como a Outra IA Deve Formatar o Prompt para o Antigravity

Quando for gerar o prompt para o Antigravity, instrua a outra IA a seguir este padrão:

```markdown
### Objetivo da Tarefa
[Descreva com clareza a funcionalidade a ser implementada]

### Requisitos Técnicos
1. Backend: [Quais arquivos modificar ou novos endpoints criar]
2. Frontend: [Quais componentes/páginas alterar ou criar]
3. Regras de Negócio: [Critérios específicos, limites de valores, tratamento de erros]

### Critérios de Aceite
- O app deve continuar funcionando em http://localhost:5173/
- Todas as mensagens e interfaces devem permanecer em Português do Brasil.
- Entregar um link clicável de 1 clique para visualização.
```

---

*Arquivo gerado automaticamente para acelerar e guiar o desenvolvimento do projeto Vigilante Parlamentar.*
