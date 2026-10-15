import React from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck, Building2, Fuel, PieChart, FileText, Landmark, Clock,
  HelpCircle, Scale, ArrowLeft, Copy, TrendingDown, Filter, Zap, Compass,
  Briefcase, MapPinCheck, Users2, CalendarDays, AlertOctagon, Flame
} from 'lucide-react'

const SEV = {
  ALTA: { cor: 'text-red-600 bg-red-50 border-red-200', badge: 'bg-red-100 text-red-800' },
  MEDIA: { cor: 'text-amber-600 bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-800' },
  BAIXA: { cor: 'text-sky-600 bg-sky-50 border-sky-200', badge: 'bg-sky-100 text-sky-800' },
}

const heuristicas = [
  {
    id: 'VINCULO_SOCIETARIO_OU_NEPOTISMO', icon: Users2, sev: 'ALTA', peso: 40,
    titulo: 'Quadro Societário (QSA) com vínculo de parentesco / autocontratação',
    resumo: 'Sócio ou administrador da empresa contratada no QSA da Receita Federal compartilha nome civil ou sobrenome familiar direto com o parlamentar.',
    origem: 'Receita Federal (QSA / BrasilAPI) + Câmara dos Deputados (Cadastro Parlamentar)',
    gatilho: 'nome_socio == nome_civil_deputado\nOR (sobrenome_familiar_socio == sobrenome_deputado AND fornecedor NOT IN (concessionárias, cias aéreas))\nAND total_contrato >= R$ 3.000,00',
    explicacao: 'Indício grave de favorecimento familiar, autocontratação velada por meio de pessoa jurídica ou direcionamento da cota para empresas de assessores/parentes.',
    mitigacao: 'Filtra e desconsidera sobrenomes patronímicos extremamente comuns (ex: Silva, Santos, Souza, Oliveira) para evitar falsos positivos acidentais.',
  },
  {
    id: 'CNAE_INCOMPATIVEL_ESTRITO', icon: AlertOctagon, sev: 'ALTA', peso: 35,
    titulo: 'Incompatibilidade estrita de CNAE com serviços intelectuais',
    resumo: 'Despesa de divulgação parlamentar ou consultoria faturada por empresa cujo ramo na Receita é de vestuário, mecânica, salão de beleza, açougue ou construção.',
    origem: 'Câmara dos Deputados (CEAP) + Receita Federal (CNAE Primário e Secundário)',
    gatilho: 'categoria IN (divulgação, consultoria, assessoria, pesquisa)\nAND CNAE IN (roupas, calçados, estética, oficina mecânica, alvenaria, bar, açougue, combustíveis)\nAND total >= R$ 2.000,00',
    explicacao: 'Demonstra incompatibilidade absoluta entre a atividade econômica real da empresa e o serviço abstrato declarado, sugerindo desvio de finalidade ou nota fiscal forjada.',
    mitigacao: 'Varre tanto o CNAE principal quanto os CNAEs secundários registrados no CNPJ antes de disparar o alerta.',
  },
  {
    id: 'SUBCAPITALIZACAO_CRITICA', icon: Building2, sev: 'ALTA', peso: 30,
    titulo: 'Subcapitalização crítica (capital social irrisório com nota vultosa)',
    resumo: 'Fornecedor com capital social formal de até R$ 2.000 emitindo notas de dezenas de milhares de reais em serviços intangíveis.',
    origem: 'Câmara dos Deputados (CEAP) + Receita Federal (BrasilAPI)',
    gatilho: 'capital_social <= R$ 2.000,00\nAND (maior_nota >= R$ 15.000,00 OR total >= R$ 25.000,00)\nAND categoria IN (divulgação, consultoria, pesquisa, TI, vídeos)',
    explicacao: 'Empresas sem patrimônio financeiro mínimo ou capacidade técnica declarada executando contratos de grande vulto em serviços de difícil mensuração física.',
    mitigacao: 'Aplica-se exclusivamente a serviços intangíveis; compras de bens físicos ou concessionárias não são avaliadas.',
  },
  {
    id: 'CONFLITO_PRESENCA_PLENARIO', icon: CalendarDays, sev: 'ALTA', peso: 35,
    titulo: 'Conflito de presença: gasto presencial na base em dia de votação no DF',
    resumo: 'Notas fiscais presenciais (combustível, refeição, hotel) emitidas no estado de origem em terças e quartas-feiras de sessões deliberativas presenciais da Câmara.',
    origem: 'Câmara dos Deputados (CEAP e Calendário Legislativo) + Receita Federal',
    gatilho: 'data_documento IN (terça-feira, quarta-feira em período legislativo ordinário)\nAND categoria IN (combustível, refeição, hotel)\nAND UF_fornecedor NOT IN (DF, GO)\nAND fornecedor NOT IN (companhias aéreas)',
    explicacao: 'Em dias de votação obrigatória em plenário em Brasília, despesas físicas presenciais registradas a milhares de quilômetros indicam cessão do cartão ou cota para terceiros.',
    mitigacao: 'Exclui recesso parlamentar (janeiro e julho), fins de semana e companhias aéreas.',
  },
  {
    id: 'QUEIMA_DE_COTA_FIM_DE_ANO', icon: Flame, sev: 'MEDIA', peso: 25,
    titulo: 'Anomalia de fim de ano ("queima de cota" em nov/dez)',
    resumo: 'Salto abrupto de gastos em categorias intangíveis em novembro e dezembro superior a 200% da média mensal do parlamentar.',
    origem: 'Câmara dos Deputados (CEAP)',
    gatilho: 'mes IN (11, 12)\nAND total_intangiveis_mes >= R$ 20.000,00\nAND total_intangiveis_mes >= (media_mensal_regular * 3.0)',
    explicacao: 'Padrão histórico de parlamentares que correm para esgotar o saldo acumulado anual da cota antes do fechamento do exercício financeiro.',
    mitigacao: 'Exige piso mínimo de R$ 20.000 no mês e triplo da média regular do próprio parlamentar.',
  },
  {
    id: 'REDE_FORNECEDOR_PARTIDARIO', icon: Users2, sev: 'ALTA', peso: 30,
    titulo: 'Rede de fornecedor compartilhado em bancada partidária',
    resumo: 'Pequena empresa prestando serviços de consultoria ou marketing digital simultaneamente para 3 ou mais deputados do mesmo partido.',
    origem: 'Base de dados consolidada do Vigilante Parlamentar (Câmara + Receita)',
    gatilho: 'mesmo CNPJ\nAND contratado por >= 3 deputados do mesmo partido político\nAND categoria IN (consultoria, marketing, divulgação)\nAND fornecedor NOT IN (concessionárias, cias aéreas)',
    explicacao: 'Indício clássico de centralização partidária de notas ou contratação de agências de fachada para abastecer caixas partidários com recursos públicos.',
    mitigacao: 'Isenta empresas tradicionais de transporte, companhias aéreas e utilidades públicas.',
  },
  {
    id: 'NOTA_FISCAL_EMPRESA_EXTINTA', icon: Clock, sev: 'ALTA', peso: 45,
    titulo: 'Nota fiscal emitida por empresa inapta ou extinta',
    resumo: 'Nota fiscal emitida quando a empresa já constava como baixada, inapta, suspensa ou nula na Receita Federal.',
    origem: 'Câmara dos Deputados (CEAP) + Receita Federal (BrasilAPI)',
    gatilho: 'data_nota > data_situacao_cadastral\nAND situacao IN (BAIXADA, INAPTA, SUSPENSA, NULA)\nAND soma >= R$ 50,00',
    explicacao: 'Uma empresa legalmente extinta ou inapta perante a Receita Federal não possui existência jurídica para fornecer mercadorias ou prestar serviços. É o indício mais grave de nota fiscal fria.',
    mitigacao: 'Cruzamento com a data exata da certidão cadastral pública da Receita Federal.',
  },
  {
    id: 'EMPRESA_RECEM_CRIADA', icon: Zap, sev: 'ALTA', peso: 35,
    titulo: 'Empresa recém-criada (casulo sob demanda)',
    resumo: 'Fornecedor aberto há menos de 90 dias antes de começar a receber pagamentos expressivos do parlamentar.',
    origem: 'Câmara dos Deputados (CEAP) + Receita Federal (BrasilAPI)',
    gatilho: '(primeira_nota - data_inicio_atividade) <= 90 dias\nAND total_acumulado >= R$ 5.000,00',
    explicacao: 'Padrão recorrente em esquemas de desvio, no qual pessoas jurídicas são constituídas às pressas exclusivamente para captar recursos públicos.',
    mitigacao: 'Piso de materialidade financeira para evitar penalizar pequenos prestadores de serviços de baixo valor.',
  },
  {
    id: 'ESTOURO_TETO_MEI', icon: Briefcase, sev: 'ALTA', peso: 35,
    titulo: 'Estouro do limite de faturamento de MEI',
    resumo: 'Microempreendedor Individual recebendo repasses acumulados desproporcionais ao limite legal anual de R$ 81.000,00.',
    origem: 'Câmara dos Deputados (CEAP) + Receita Federal (BrasilAPI)',
    gatilho: 'opcao_pelo_mei == True\nAND total_recebido_do_deputado >= R$ 50.000,00\n(teto anual nacional do MEI é de R$ 81.000,00)',
    explicacao: 'O regime MEI foi instituído para pequenos trabalhadores autônomos. Um único parlamentar pagar mais de 60% a 100% do teto anual do MEI indica burla tributária.',
    mitigacao: 'Consulta direta ao atributo oficial de opção pelo MEI registrado no banco da Receita Federal.',
  },
  {
    id: 'TELETRANSPORTE_DISTANCIA_IMPOSSIVEL', icon: Compass, sev: 'ALTA', peso: 30,
    titulo: 'Teletransporte: despesas presenciais em locais distantes (> 800 km)',
    resumo: 'Notas fiscais de abastecimento, refeição ou hospedagem registradas na mesma data em estados distantes sem tempo físico de locomoção.',
    origem: 'Câmara dos Deputados (CEAP) + Receita Federal (BrasilAPI)',
    gatilho: 'mesma data_documento\nAND categoria IN (combustível, refeição, hotel)\nAND UF_fornecedor_1 != UF_fornecedor_2 (distância > 800 km)\nAND fornecedor NOT IN (companhias aéreas)',
    explicacao: 'Demonstra a impossibilidade física de presença simultânea do parlamentar nos dois locais, sugerindo emissão de notas para justificar saques de cota.',
    mitigacao: 'Aplica-se exclusivamente a compras comprovadamente presenciais; compras digitais e companhias aéreas são excluídas.',
  },
  {
    id: 'GASTOS_CONCORRENTES_MESMA_DATA', icon: MapPinCheck, sev: 'MEDIA', peso: 15,
    titulo: 'Simultaneidade geográfica de despesas na mesma data',
    resumo: 'Despesas presenciais (alimentação, hospedagem) registradas em municípios distintos na mesma data.',
    origem: 'Câmara dos Deputados (CEAP) + Receita Federal (BrasilAPI)',
    gatilho: 'mesma data_documento\nAND categoria IN (alimentação, hospedagem, combustível)\nAND municipio_1 != municipio_2\nAND fornecedor NOT IN (companhias aéreas)',
    explicacao: 'Indício de refeições ou pernoites ocorrendo simultaneamente em praças diferentes, demandando verificação dos comprovantes originais.',
    mitigacao: 'Classificação com severidade Média, orientando a checagem dos horários e itinerários de viagem.',
  },
  {
    id: 'COMBUSTIVEL_GRAVE', icon: Fuel, sev: 'ALTA', peso: 30,
    titulo: 'Combustível exorbitante em cupom único (> R$ 1.500)',
    resumo: 'Abastecimento em posto único com valor superior a R$ 1.500,00 em uma única nota fiscal.',
    origem: 'Câmara dos Deputados (CEAP)',
    gatilho: 'categoria = combustível\nAND valor_nota > R$ 1.500,00 (equivalente a > 250 litros)',
    explicacao: 'Nenhum veículo individual convencional comporta esse volume em um único abastecimento. Aponta abastecimento de comboios não autorizados pela cota.',
    mitigacao: 'Graduado em severidade Alta quando o valor excede R$ 1.500,00.',
  },
  {
    id: 'COMBUSTIVEL_DESPROPORCIONAL', icon: Fuel, sev: 'MEDIA', peso: 10,
    titulo: 'Abastecimento excessivo (> R$ 600 ou > R$ 2.000/mês no mesmo posto)',
    resumo: 'Notas entre R$ 600 e R$ 1.500 ou concentração mensal superior a R$ 2.000,00 em um mesmo estabelecimento.',
    origem: 'Câmara dos Deputados (CEAP)',
    gatilho: 'categoria = combustível\nAND (R$ 600,00 < valor_nota <= R$ 1.500,00\nOR acumulado_mensal_posto > R$ 2.000,00)',
    explicacao: 'Valores que ultrapassam a capacidade média de um tanque de automóvel de passeio (50 a 60 litros), indicando uso atípico.',
    mitigacao: 'Severidade Média/Baixa que acolhe exceções legítimas como picapes diesel de grande porte ou vans oficiais.',
  },
  {
    id: 'NOTA_FISCAL_DUPLICADA', icon: Copy, sev: 'ALTA', peso: 35,
    titulo: 'Nota fiscal idêntica apresentada mais de uma vez',
    resumo: 'O mesmo número de documento fiscal do mesmo fornecedor apresentado em pedidos separados de reembolso.',
    origem: 'Câmara dos Deputados (CEAP)',
    gatilho: 'mesmo CNPJ AND mesmo numero_documento\nAND ocorrencias >= 2 AND valor >= R$ 100,00',
    explicacao: 'Reembolso em duplicidade utilizando o mesmo fato gerador e a mesma nota fiscal emitida.',
    mitigacao: 'Companhias aéreas são isentas porque bilhetes múltiplos compartilham o código de localizador da agência corporativa da Câmara.',
  },
  {
    id: 'POSSIVEL_DUPLICIDADE', icon: Copy, sev: 'BAIXA', peso: 10,
    titulo: 'Possível duplicidade de valor e data com numeração divergente',
    resumo: 'Notas fiscais de mesmo valor emitidas para o mesmo fornecedor na mesma data com códigos de documento diferentes.',
    origem: 'Câmara dos Deputados (CEAP)',
    gatilho: 'mesmo CNPJ AND mesma data AND mesmo valor >= R$ 400,00\nAND fornecedor NOT IN (concessionárias públicas)',
    explicacao: 'Pode decorrer de duplicidade involuntária no envio de comprovantes ou emissão incorreta pelo prestador.',
    mitigacao: 'Concessionárias de energia elétrica, água e telefonia são expressamente isentas desse alerta.',
  },
  {
    id: 'CAPITAL_SOCIAL_INCOMPATIVEL', icon: Building2, sev: 'ALTA', peso: 30,
    titulo: 'Capital social incompatível com o porte dos serviços',
    resumo: 'Empresa com capital formal irrisório (< R$ 5.000) recebendo contratos vultosos em consultoria ou divulgação.',
    origem: 'Câmara dos Deputados (CEAP) + Receita Federal (BrasilAPI)',
    gatilho: 'capital_social < R$ 5.000,00\nAND total_recebido >= R$ 15.000,00\nAND total_recebido >= 10x capital_social\nAND categoria IN (divulgação, consultoria, pesquisa)',
    explicacao: 'Empresas sem lastro financeiro ou estrutura operacional declarada na Receita executando serviços discricionários de alto valor.',
    mitigacao: 'Aplica-se exclusivamente a serviços intelectuais e imateriais; cadastros sem dado de capital não sofrem penalidade.',
  },
  {
    id: 'FRACIONAMENTO_DE_DESPESA', icon: FileText, sev: 'MEDIA', peso: 20,
    titulo: 'Fracionamento suspeito de compras em curto intervalo',
    resumo: 'Múltiplas notas fiscais do mesmo fornecedor emitidas em janela de até 7 dias somando montante elevado.',
    origem: 'Câmara dos Deputados (CEAP)',
    gatilho: 'mesmo CNPJ\nAND >= 3 notas em até 7 dias\nAND soma >= R$ 5.000,00\nAND categoria NOT IN (combustível, energia, telefone)',
    explicacao: 'Subdivisão artificial de despesas de um mesmo serviço para contornar fiscalização ou justificar faturamentos contínuos.',
    mitigacao: 'Exclui utilidades públicas e combustível, onde compras repetidas são rotineiras.',
  },
  {
    id: 'MONOPOLIO_SETORIAL', icon: PieChart, sev: 'MEDIA', peso: 20,
    titulo: 'Concentração orçamentária em fornecedor único (> 30% da cota)',
    resumo: 'Um único fornecedor privado absorvendo mais de 30% de todo o orçamento da cota parlamentar auditada do deputado.',
    origem: 'Câmara dos Deputados (CEAP)',
    gatilho: 'total_cota_auditada >= R$ 15.000,00\nAND fornecedor NOT IN (concessionárias, cias aéreas)\nAND (fatia_fornecedor_na_cota >= 30% OR fatia_categoria >= 70%)',
    explicacao: 'Concentração desproporcional de recursos públicos em um único agente econômico, em detrimento do princípio da impessoalidade.',
    mitigacao: 'Concessionárias públicas essenciais (Enel, CPFL, Sabesp) e companhias aéreas são automaticamente excluídas.',
  },
  {
    id: 'CNAE_INCOMPATIVEL', icon: Scale, sev: 'MEDIA', peso: 20,
    titulo: 'Ramo de atividade (CNAE) incompatível com o serviço',
    resumo: 'Contratação de divulgação ou assessoria faturada por empresa cuja atividade primária na Receita é de ramo divergente.',
    origem: 'Câmara dos Deputados (CEAP) + Receita Federal (BrasilAPI)',
    gatilho: 'categoria IN (divulgação, consultoria, assessoria)\nAND CNAE_principal IN (restaurante, mecânica, autopeças, construção)\nAND total >= R$ 2.000,00',
    explicacao: 'Inconsistência entre a atividade formal declarada perante a autoridade tributária e o serviço declarado perante a Câmara.',
    mitigacao: 'Considera a existência de CNAEs secundários através de ponderação moderada de severidade Média.',
  },
  {
    id: 'EMPRESA_BAIXADA_APOS_PAGAMENTOS', icon: TrendingDown, sev: 'MEDIA', peso: 15,
    titulo: 'Empresa encerrada na Receita logo após receber os recursos',
    resumo: 'Fornecedor recebe pagamentos relevantes e encerra suas atividades perante a Receita Federal em até 180 dias.',
    origem: 'Câmara dos Deputados (CEAP) + Receita Federal (BrasilAPI)',
    gatilho: 'situacao IN (BAIXADA, INAPTA)\nAND total_recebido >= R$ 5.000,00\nAND (data_baixa - data_ultimo_pagamento) <= 180 dias',
    explicacao: 'Comportamento característico de empresas de fachada abertas temporariamente para desviar verbas e prontamente dissolvidas.',
    mitigacao: 'Exige comprovação documental da proximidade temporal entre o repasse e a extinção do CNPJ.',
  },
  {
    id: 'PATRIMONIO_ELEVADO', icon: Landmark, sev: 'BAIXA', peso: 5,
    titulo: 'Patrimônio declarado elevado (TSE 2022)',
    resumo: 'Patrimônio oficial pessoal declarado à Justiça Eleitoral superior a R$ 10 milhões.',
    origem: 'Tribunal Superior Eleitoral - TSE (DivulgaCandContas 2022)',
    gatilho: 'patrimonio_declarado_2022 > R$ 10.000.000,00',
    explicacao: 'Ter patrimônio elevado não constitui qualquer irregularidade jurídica. Funciona como linha de base oficial para fiscalização e acompanhamento da compatibilidade econômico-financeira entre mandatos.',
    mitigacao: 'Severidade Baixa com peso simbólico de 5 pontos, estritamente informativo.',
  },
]

export default function Metodologia() {
  return (
    <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in duration-500 pb-16">
      <Link to="/" className="inline-flex items-center text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1.5" /> Voltar ao Painel Geral
      </Link>

      <header className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 mb-4">
          <ShieldCheck className="w-4 h-4" /> Metodologia Forense v6 (21 Heurísticas Ativas)
        </div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-3">Critérios de Auditoria & Fórmulas Forenses</h1>
        <p className="text-slate-600 text-lg leading-relaxed max-w-3xl">
          O <strong>Vigilante Parlamentar</strong> realiza fiscalização cívica automatizada cruzando dados da <strong>Câmara dos Deputados (CEAP)</strong>, <strong>Receita Federal (BrasilAPI/QSA)</strong> e <strong>Tribunal Superior Eleitoral (TSE)</strong>, aplicando filtros rigorosos de materialidade financeira e eliminação de falsos positivos.
        </p>
      </header>

      {/* Princípios anti falso positivo */}
      <section className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Filter className="w-5 h-5 text-blue-600" /> Princípios de Rigor Forense & Proteção Anti-Falso Positivo
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-700">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <strong className="text-slate-900 block mb-1">1. Materialidade Financeira Obrigatória</strong>
            Pequenos valores operacionais (como contas de luz de R$ 30 a R$ 60) não disparam alarmes indevidos de duplicidade ou monopólio.
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <strong className="text-slate-900 block mb-1">2. Isenção de Concessionárias Públicas</strong>
            Empresas de utilidade pública (energia como Enel, Equatorial, CPFL; água como Sabesp; telefonia como Claro, Vivo) são isentas de monopólio.
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <strong className="text-slate-900 block mb-1">3. Tratamento de Bilhetes Aéreos Corporativos</strong>
            Companhias aéreas (Gol, Latam, Azul) com bilhetes faturados via agência corporativa da Câmara não sofrem falsos alarmes por reemissão de trechos nem por notas zeradas (R$ 0,00).
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <strong className="text-slate-900 block mb-1">4. Reincidência Ponderada com Teto</strong>
            Múltiplas ocorrências da mesma regra somam pontuação gradual com teto máximo de 1,5x o peso base, evitando distorções no índice geral.
          </div>
        </div>
      </section>

      {/* Escala */}
      <section className="bg-slate-900 text-white rounded-2xl p-8 shadow-md">
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
          <Scale className="text-amber-400 w-5 h-5" /> Cálculo do Índice de Risco (0 a 100 pontos)
        </h2>
        <p className="text-slate-300 text-sm mb-4 max-w-3xl">
          Cada inconformidade detectada pelo motor forense adiciona pontos de penalidade proporcionais à sua gravidade até o limite de 100 pontos.
        </p>
        <code className="block bg-slate-800 text-emerald-400 p-3 rounded-xl text-xs font-mono mb-6">
          indice_risco = min(100.0, Σ [ peso_regra × min(1 + 0.25 × (ocorrências − 1), 1.5) ])
        </code>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-xl">
            <span className="text-emerald-400 font-bold text-xs uppercase tracking-wider block mb-1">0 a 20 pontos</span>
            <p className="text-xl font-black mb-1">Risco Baixo</p>
            <p className="text-slate-400 text-xs">Padrão regular de gastos dentro das conformidades estatísticas médias da Câmara dos Deputados.</p>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-xl">
            <span className="text-amber-400 font-bold text-xs uppercase tracking-wider block mb-1">21 a 50 pontos</span>
            <p className="text-xl font-black mb-1">Risco Médio (Atenção)</p>
            <p className="text-slate-400 text-xs">Presença de anomalias setoriais, monopólios acima de 30% ou despesas atípicas em postos e fornecedores.</p>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-xl">
            <span className="text-red-400 font-bold text-xs uppercase tracking-wider block mb-1">51 a 100 pontos</span>
            <p className="text-xl font-black mb-1">Risco Alto (Crítico)</p>
            <p className="text-slate-400 text-xs">Indícios graves: nepotismo em QSA, empresas extintas, recém-abertas casulo, estouro de teto de MEI ou teletransporte físico.</p>
          </div>
        </div>
      </section>

      {/* Regras */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 className="text-2xl font-bold text-slate-900">Catálogo das 21 Heurísticas Forenses Ativas</h2>
          <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-3 py-1 rounded-full border border-slate-200">
            Auditoria Contínua
          </span>
        </div>
        <div className="grid grid-cols-1 gap-6">
          {heuristicas.map((h, i) => {
            const Icon = h.icon
            const s = SEV[h.sev]
            return (
              <div key={h.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl border ${s.cor}`}><Icon className="w-6 h-6" /></div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{i + 1}. {h.titulo}</h3>
                      <p className="text-slate-500 text-sm mt-0.5">{h.resumo}</p>
                      <p className="text-[11px] font-mono text-slate-400 mt-1">{h.id}</p>
                    </div>
                  </div>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider self-start whitespace-nowrap ${s.badge}`}>
                    {h.sev === 'MEDIA' ? 'Média' : h.sev === 'ALTA' ? 'Alta' : 'Baixa'} · {h.peso} pts
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100 text-sm">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Fórmula de Gatilho</p>
                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded-xl text-xs font-mono whitespace-pre-wrap">{h.gatilho}</pre>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Base de Dados Consultada</p>
                    <p className="text-slate-700 font-semibold bg-slate-50 p-3 rounded-xl border border-slate-100">🏛️ {h.origem}</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
                  <div><strong className="text-slate-800">Por que investigar:</strong> {h.explicacao}</div>
                  <div><strong className="text-slate-800">Proteção contra falso positivo:</strong> {h.mitigacao}</div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-900 flex items-start gap-3 shadow-sm">
        <HelpCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm leading-relaxed">
          <strong>Aviso legal & transparência:</strong> Os alertas gerados pelo Vigilante Parlamentar representam inconformidades estatísticas e inconsistências em bases cadastrais públicas oficiais, não constituindo pré-julgamento ou condenação jurídica. O acesso direto às notas fiscais oficiais é franqueado ao cidadão para auditoria popular independente.
        </p>
      </div>
    </div>
  )
}
