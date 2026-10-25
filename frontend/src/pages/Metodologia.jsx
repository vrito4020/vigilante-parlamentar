import React from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck, Building2, Fuel, PieChart, FileText, Landmark, Clock,
  HelpCircle, Scale, ArrowLeft, Copy, TrendingDown, Filter, Zap, Compass,
  Briefcase, MapPinCheck, Users2, CalendarDays, AlertOctagon, Flame, ShieldAlert
} from 'lucide-react'

const SEV = {
  ALTA: { cor: 'text-red-600 bg-red-50 border-red-200', badge: 'bg-red-100 text-red-800' },
  MEDIA: { cor: 'text-amber-600 bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-800' },
  BAIXA: { cor: 'text-sky-600 bg-sky-50 border-sky-200', badge: 'bg-sky-100 text-sky-800' },
}

const heuristicas = [
  {
    id: 'FORNECEDOR_SANCIONADO_CEIS_CNEP', icon: ShieldAlert, sev: 'ALTA', peso: 50,
    titulo: 'Fornecedor Sancionado no CEIS/CNEP (Controladoria-Geral da União - CGU)',
    resumo: 'Fornecedor contratado com cota parlamentar consta formalmente proibido de licitar e contratar com o Poder Público por atos de corrupção ou fraude.',
    origem: 'Controladoria-Geral da União (CGU - Bases CEIS, CNEP e CEPIM)',
    gatilho: 'CNPJ_fornecedor IN (CEIS, CNEP, CEPIM da CGU)\nAND total_pago_ceap > 0',
    explicacao: 'A contratação de empresas declaradas inidôneas ou suspensas por órgãos públicos municipais, estaduais ou federais viola o princípio da moralidade e a Lei Anticorrupção (Lei 12.846/13).',
    mitigacao: 'Cruzamento diário direto com a base oficial consolidada da CGU contendo mais de 12.300 CNPJs sancionados.',
  },
  {
    id: 'EMENDA_FAVORECIDO_SANCIONADO_CGU', icon: ShieldAlert, sev: 'ALTA', peso: 50,
    titulo: 'Favorecido Final de Emenda Parlamentar Sancionado na CGU (CEIS/CNEP)',
    resumo: 'Empresa privada ou entidade que recebeu recursos oriundos de emenda parlamentar do deputado consta na lista negra de inidôneos da CGU.',
    origem: 'Portal da Transparência CGU (Emendas por Favorecido + CEIS/CNEP)',
    gatilho: 'CNPJ_favorecido_emenda IN (CEIS, CNEP, CEPIM)\nAND valor_recebido_emenda >= R$ 500,00',
    explicacao: 'Identifica quando verbas milionárias enviadas por emendas parlamentares acabam pagando empresas declaradas inidôneas pelo Ministério Público, Tribunais ou governos estaduais/municipais.',
    mitigacao: 'Exclui bancos públicos intermediários (Caixa e Banco do Brasil) para auditar estritamente o destinatário final do recurso.',
  },
  {
    id: 'TRIANGULACAO_EMENDA_FORNECEDOR_CEAP', icon: Scale, sev: 'ALTA', peso: 50,
    titulo: 'Triangulação de Verba Pública (Emenda Parlamentar × Fornecedor da Cota)',
    resumo: 'A mesma empresa recebe simultaneamente verbas de Emendas Parlamentares destinadas pelo deputado e pagamentos diretos da Cota Parlamentar (CEAP).',
    origem: 'Portal da Transparência CGU (Emendas) + Câmara dos Deputados (CEAP)',
    gatilho: 'CNPJ_favorecido_emenda == CNPJ_fornecedor_ceap_do_mesmo_deputado',
    explicacao: 'Indício crítico de confusão patrimonial e direcionamento cruzado de recursos orçamentários e verbas indenizatórias de gabinete para o mesmo grupo econômico.',
    mitigacao: 'Exige correspondência exata de CNPJ de 14 dígitos entre a base de execução de emendas e as notas fiscais da cota.',
  },
  {
    id: 'FORNECEDOR_CEAP_SUPERCONTRATO_EXECUTIVO', icon: Landmark, sev: 'ALTA', peso: 45,
    titulo: 'Fornecedor CEAP com Supercontratos Públicos no Executivo (PNCP)',
    resumo: 'Fornecedor privado contratado pelo gabinete na Cota Parlamentar detém contratos milionários com Prefeituras, Governos Estaduais ou Ministérios.',
    origem: 'Portal Nacional de Contratações Públicas (PNCP) + Câmara dos Deputados (CEAP)',
    gatilho: 'CNPJ_fornecedor_ceap IN contratos_PNCP\nAND soma_contratos_pncp >= R$ 150.000,00 (ALTA se >= R$ 1.000.000,00)',
    explicacao: 'Revela empresas de grande porte licitatório (construtoras, locadoras, gráficas e agências) que atuam simultaneamente prestando serviços ao gabinete parlamentar e vencendo licitações milionárias no Poder Executivo.',
    mitigacao: 'Isenta automaticamente concessionárias de energia/água/telefonia, correios e companhias aéreas nacionais.',
  },
  {
    id: 'COINCIDENCIA_TERRITORIAL_CONTRATO_EMENDA', icon: MapPinCheck, sev: 'ALTA', peso: 40,
    titulo: 'Cruzamento Territorial: Contrato PNCP no Reduto de Emendas ou Base Eleitoral',
    resumo: 'Fornecedor da Cota Parlamentar firmou contrato público com prefeitura/órgão exatamente no município contemplado por emendas do deputado ou em sua UF eleitoral.',
    origem: 'PNCP (Contratos Municipais/Estaduais) + Portal da Transparência (Emendas) + Câmara (CEAP)',
    gatilho: 'CNPJ_fornecedor_ceap == CNPJ_contratado_PNCP\nAND (municipio_orgao_pncp IN municipios_emendas_deputado OR uf_orgao_pncp == uf_deputado)',
    explicacao: 'Detecta o circuito fechado regional: o parlamentar destina emendas para determinadas prefeituras/estados onde empresas ligadas ao seu gabinete vencem contratos públicos.',
    mitigacao: 'Aplica piso mínimo de materialidade contratual no PNCP (R$ 50 mil para coincidência municipal exata e R$ 250 mil para coincidência estadual).',
  },
  {
    id: 'CARTEL_ENDERECO_OU_CONTATO_FORNECEDORES', icon: Building2, sev: 'ALTA', peso: 45,
    titulo: 'Cartel de Fornecedores: Sede Física (CEP/Nº) ou Telefone Compartilhado',
    resumo: 'Empresas com raízes de CNPJ distintas contratadas na Cota Parlamentar operam no mesmo endereço físico ou compartilham o mesmo telefone na Receita Federal.',
    origem: 'Receita Federal (BrasilAPI - Endereço Predial, CEP e Telefones) + Câmara (CEAP)',
    gatilho: 'CNPJ_A[:8] != CNPJ_B[:8]\nAND ((CEP_A == CEP_B AND Numero_A == Numero_B) OR Telefone_Receita_A == Telefone_Receita_B)',
    explicacao: 'Revela clusters de empresas operadas pelo mesmo escritório contábil ou galpão compartilhado que simulam concorrência ou dividem faturamento de cotas parlamentares.',
    mitigacao: 'Compara apenas raízes de CNPJ distintas (excluindo matriz/filial da mesma empresa) e ignora CEPs genéricos da Esplanada dos Ministérios.',
  },
  {
    id: 'REDE_SOCIETARIA_OCULTA_FORNECEDORES', icon: Users2, sev: 'ALTA', peso: 45,
    titulo: 'Rede Societária Oculta no QSA (Mesmo Sócio em Múltiplas Fornecedoras)',
    resumo: 'Pessoa física figura simultaneamente no Quadro de Sócios e Administradores (QSA) de duas ou mais empresas diferentes que faturam na Cota Parlamentar.',
    origem: 'Receita Federal (Quadro Societário QSA / BrasilAPI) + Câmara (CEAP)',
    gatilho: 'socio_QSA IN (Empresa_A, Empresa_B)\nAND CNPJ_A[:8] != CNPJ_B[:8]',
    explicacao: 'Identifica grupos econômicos familiares ou empresariais que utilizam múltiplos CNPJs diferentes (gráfica, consultoria, locadora) para pulverizar recebimentos da Câmara.',
    mitigacao: 'Exige correspondência exata do nome completo do sócio entre raízes empresariais distintas.',
  },
  {
    id: 'SEDE_FANTASMA_OU_ENDERECO_INCONSISTENTE', icon: Compass, sev: 'ALTA', peso: 35,
    titulo: 'Auditoria Física de Sede: Endereço Sem Número, Sem Contato ou Subcapitalizado',
    resumo: 'Fornecedor de serviços intangíveis/discricionários com endereço sem numeração predial (S/N), sem telefone/e-mail na Receita ou capital social irrisório.',
    origem: 'Receita Federal (Cadastro Sincronizado CNPJ) + Google Maps OSINT + Câmara (CEAP)',
    gatilho: 'categoria IN (divulgação, consultoria, locação, assessoria)\nAND total_recebido >= R$ 6.000,00\nAND (numero IN ("S/N", "0") OR sem_telefone_e_email OR capital_social <= R$ 3.000,00)',
    explicacao: 'Empresas de fachada frequentemente possuem cadastros incompletos, sem número predial verificável ou capital social simbólico frente a dezenas de milhares de reais faturados.',
    mitigacao: 'Fornece link direto de 1 clique para inspeção visual da fachada via Google Maps / Street View.',
  },
  {
    id: 'NEPOTISMO_CRUZADO_INTERGABINETES', icon: Users2, sev: 'ALTA', peso: 45,
    titulo: 'Nepotismo Cruzado Intergabinetes (Câmara dos Deputados × Senado Federal)',
    resumo: 'Secretário parlamentar lotado no gabinete compartilha sobrenome familiar incomum com outro Deputado Federal ou Senador da República da mesma UF/partido.',
    origem: 'Folha de Pessoal da Câmara + Dados Abertos do Senado Federal + Cadastro Parlamentar',
    gatilho: 'sobrenome_raro(assessor_gabinete) IN sobrenomes_raros(Senadores_81 UNION Deputados_513)\nAND (mesma_UF OR mesmo_partido OR multiplos_sobrenomes)',
    explicacao: 'Para contornar a Súmula Vinculante 13 do STF (que veda nomear parentes no próprio gabinete), parlamentares realizam o nepotismo cruzado nomeando parentes de colegas de bancada estadual ou do Senado.',
    mitigacao: 'Filtra mais de 80 sobrenomes patronímicos comuns (Silva, Santos, Oliveira, Souza, etc.) e prenomes compostos.',
  },
  {
    id: 'ASSESSOR_DOADOR_CAMPANHA_TSE', icon: Scale, sev: 'ALTA', peso: 40,
    titulo: 'Rachadinha Eleitoral: Assessor Comissionado Financiador de Campanha (TSE)',
    resumo: 'Secretário parlamentar nomeado em cargo comissionado no gabinete consta como doador ou fornecedor financeiro da campanha eleitoral do deputado no TSE.',
    origem: 'Tribunal Superior Eleitoral (TSE - Prestação de Contas 2022) + Folha de Gabinete da Câmara',
    gatilho: 'nome_assessor_gabinete == nome_doador_campanha_TSE\nOR sobrenome_raro(assessor) == sobrenome_raro(grande_doador_PF_TSE)',
    explicacao: 'Detecta o retorno de doação de campanha mediante nomeação em cargo público comissionado ou a exigência de aportes eleitorais por parte de assessores de gabinete.',
    mitigacao: 'Destaca separadamente a coincidência nominal exata (100% do nome completo) e o vínculo familiar raro.',
  },
  {
    id: 'CLA_FAMILIAR_NO_GABINETE', icon: Users2, sev: 'MEDIA', peso: 35,
    titulo: 'Concentração de Clã Familiar na Folha do Mesmo Gabinete',
    resumo: 'Dois ou mais secretários parlamentares lotados simultaneamente no mesmo gabinete compartilham o mesmo sobrenome familiar.',
    origem: 'Portal da Transparência da Câmara dos Deputados (Recursos Humanos / Lotação por Gabinete)',
    gatilho: 'COUNT(assessores_mesmo_gabinete COM mesmo_sobrenome_familiar) >= 2',
    explicacao: 'Sinaliza a contratação de núcleos familiares inteiros (cônjuges, irmãos ou pais e filhos) dentro da mesma estrutura comissionada de gabinete.',
    mitigacao: 'Desconsidera os 20 sobrenomes mais frequentes do país quando isolados.',
  },
  {
    id: 'CERTIDAO_CRIMINAL_OBJETO_E_PE_POSITIVA', icon: Scale, sev: 'ALTA', peso: 45,
    titulo: 'Certidão Judicial Criminal / Cível Positiva (Certidão de Objeto e Pé no TSE/CNJ)',
    resumo: 'Parlamentar apresentou Certidões Judiciais de Objeto e Pé à Justiça Eleitoral por possuir apontamentos em certidões criminais ou de foro especial.',
    origem: 'Tribunal Superior Eleitoral (Repositório de Certidões Judiciais codTipo 13/16/17) + CNJ DataJud',
    gatilho: 'COUNT(certidoes_objeto_e_pe_TSE) >= 1\n(ALTA se >= 2 certidões de objeto e pé anexadas)',
    explicacao: 'Pela legislação eleitoral (Res. TSE nº 23.609), a Certidão de Objeto e Pé só é exigida quando as certidões criminais da Justiça Federal, Estadual ou de Foro por Prerrogativa de Função apresentam registros positivos de ações em andamento.',
    mitigacao: 'Fornece o link oficial direto para download e leitura integral de cada Certidão Judicial de Objeto e Pé depositada no TSE.',
  },
  {
    id: 'REDE_PROCESSOS_SANCIONADORES_CONTRATADOS', icon: ShieldAlert, sev: 'ALTA', peso: 40,
    titulo: 'Rede de Processos Sancionadores (PAD / Acórdãos CGU-TCU) em Contratados do Gabinete',
    resumo: 'Fornecedores da cota parlamentar ou destinatários de emendas do deputado figuram como réus condenados em processos administrativos sancionadores.',
    origem: 'Controladoria-Geral da União (Processos Sancionadores CEIS/CNEP) + TCU + Câmara (CEAP)',
    gatilho: 'processo_sancionador_CGU_TCU ATIVO para CNPJ contratado pelo gabinete ou emenda',
    explicacao: 'Rastreia o número exato do Processo Administrativo de Responsabilização (PAR/PAD) ou Acórdão que condenou empresas recebedoras de verbas ligadas ao parlamentar.',
    mitigacao: 'Vincula cada processo administrativo ao respectivo órgão julgador sancionador e fundamentação legal.',
  },
  {
    id: 'LITIGIOSIDADE_CONTAS_ELEITORAIS_DATAJUD', icon: Scale, sev: 'MEDIA', peso: 35,
    titulo: 'Litigiosidade Atípica em Prestação de Contas Eleitorais no CNJ DataJud',
    resumo: 'Processo judicial de Prestação de Contas Eleitorais no TRE apresenta volume atípico de movimentações processuais, diligências, embargos ou recursos.',
    origem: 'Conselho Nacional de Justiça — API Pública Nacional do CNJ DataJud (TREs)',
    gatilho: 'classe == "Prestação de Contas Eleitorais"\nAND (total_movimentacoes_datajud >= 45 OR recurso_eleitoral_detectado)',
    explicacao: 'Prestações de contas eleitorais regulares encerram-se rapidamente com sentença simples; autos que ultrapassam dezenas ou centenas de movimentações no DataJud indicam impugnações técnicas, diligências sobre gastos de campanha ou recursos contra desaprovação/multa.',
    mitigacao: 'Consulta em tempo real a árvore de movimentos oficiais da API Pública do CNJ DataJud.',
  },
  {
    id: 'SERVIDOR_GABINETE_EXPULSO_CEAF_OU_DUPLA_LOTACAO', icon: ShieldAlert, sev: 'ALTA', peso: 45,
    titulo: 'Servidor de Gabinete no CEAF/DOU (Expulsão Federal) ou Dupla Lotação Simultânea',
    resumo: 'Secretário parlamentar consta no Cadastro de Expulsões da Administração Federal (CEAF/CGU) com punição publicada no DOU ou acumula duas lotações simultâneas na Câmara.',
    origem: 'CGU (CEAF / Diário Oficial da União - DOU) + Dados Abertos da Câmara (funcionarios.json)',
    gatilho: 'nome_servidor IN CEAF_DOU (Demissão / Destituição)\nOR COUNT(lotacoes_simultaneas_camara) >= 2',
    explicacao: 'Detecta a nomeação em cargos de confiança de servidores expulsos do serviço público por processos disciplinares publicados no DOU ou que figuram simultaneamente em múltiplos gabinetes/lideranças.',
    mitigacao: 'Exige nome completo com 3 ou mais tokens e exibe o número do processo e a página do Diário Oficial da União.',
  },
  {
    id: 'FAMILIA_ASSESSOR_FORNECEDOR_CEAP', icon: Users2, sev: 'ALTA', peso: 45,
    titulo: 'Conflito Familiar / Societário: Assessor de Gabinete × Empresa Fornecedora da Cota (QSA)',
    resumo: 'Secretário parlamentar lotado no gabinete é sócio ou possui parentesco direto (sobrenome familiar raro) com o Quadro Societário (QSA) de fornecedora paga pela CEAP.',
    origem: 'Dados Abertos da Câmara (Folha Funcional) + Receita Federal (QSA / BrasilAPI) + CEAP',
    gatilho: 'sobrenome_raro(servidor_gabinete) IN sobrenomes_raros(QSA_fornecedor_contratado_pelo_deputado)',
    explicacao: 'Revela esquemas em que o parlamentar emprega um membro da família no gabinete em Brasília enquanto contrata a empresa dos parentes desse assessor com verba indenizatória da Cota Parlamentar.',
    mitigacao: 'Aplica filtro estrito de sobrenomes raros e exige que a empresa tenha faturado notas fiscais no próprio gabinete.',
  },
  {
    id: 'SUPERLOTACAO_CNE_OU_GIRO_PORTARIAS', icon: Briefcase, sev: 'MEDIA', peso: 35,
    titulo: 'Superlotação de Cargos CNE Extra-Cota ou Giro Intenso de Portarias Salariais no Diário',
    resumo: 'Gabinete acumula 3 ou mais Cargos de Natureza Especial (CNE07–CNE15) pagos fora da Verba de Gabinete ou registra intenso giro de recalibração de níveis SP por Portaria.',
    origem: 'Dados Abertos da Câmara dos Deputados (funcionarios.json — Atos de Nomeação e Níveis SP/CNE)',
    gatilho: 'COUNT(cargos_CNE_no_gabinete) >= 3\nOR COUNT(recalibracoes_portaria_recente) >= 8',
    explicacao: 'Cargos CNE custam de R$ 10,6 mil a R$ 19,2 mil mensais cada e são pagos pelo orçamento geral da Câmara fora da cota do gabinete; já o giro frequente de portarias SP01–SP25 indica recalibração contínua de salários de assessores.',
    mitigacao: 'Diferencia reajustes legais automáticos (ato LEI) de alterações discricionárias individuais (ato PORTARIA / ATO DO PRESIDENTE).',
  },
  {
    id: 'VOLUME_CRITICO_EMENDA_PIX', icon: Zap, sev: 'ALTA', peso: 35,
    titulo: 'Volume Crítico de "Emendas PIX" (Transferências Especiais sem Projeto Prévio)',
    resumo: 'Parlamentar destinou mais de R$ 5 milhões a R$ 20+ milhões via Transferências Especiais ("Emendas PIX") sem vinculação prévia a convênio ou obra definida.',
    origem: 'Portal da Transparência CGU / Transferegov (Emendas Parlamentares 2023–2026)',
    gatilho: 'tipo_emenda == "Emenda Individual - Transferências Especiais"\nAND soma_empenhada >= R$ 5.000.000,00',
    explicacao: 'As "Emendas PIX" caem diretamente na conta de prefeituras e estados sem plano de trabalho prévio aprovado, dificultando o rastreamento social e sendo alvo de determinações de transparência do STF e TCU.',
    mitigacao: 'Graduado em severidade Média (R$ 5M a R$ 20M) e Alta (acima de R$ 20M).',
  },
  {
    id: 'CONCENTRACAO_MUNICIPIO_EMENDA', icon: MapPinCheck, sev: 'MEDIA', peso: 25,
    titulo: 'Concentração Geográfica de Emendas em Reduto Único (> 55%)',
    resumo: 'Mais de 55% de todos os recursos de emendas com município identificado foram concentrados em uma única cidade reduto.',
    origem: 'Portal da Transparência CGU (Emendas por Favorecido)',
    gatilho: 'soma_favorecidos_municipio / soma_total_localizada >= 55%\nAND total_localizado >= R$ 1.000.000,00',
    explicacao: 'Aponta hiperconcentração orçamentária em redutos eleitorais específicos em detrimento da distribuição regional equânime.',
    mitigacao: 'Desconsidera repasses genéricos centralizados em Brasília/DF ou rubricas de escopo "Múltiplo".',
  },
  {
    id: 'ASSESSOR_SOCIO_FORNECEDOR', icon: Users2, sev: 'ALTA', peso: 45,
    titulo: 'Secretário Parlamentar de Gabinete sócio de empresa fornecedora da cota',
    resumo: 'Servidor comissionado nomeado no próprio gabinete parlamentar figura no Quadro Societário (QSA) de empresa que recebe pagamentos da CEAP.',
    origem: 'Câmara dos Deputados (Folha de Recursos Humanos) + Receita Federal (QSA / BrasilAPI)',
    gatilho: 'nome_assessor_gabinete == nome_socio_QSA_fornecedor\nAND fornecedor_contratado_pelo_deputado == True',
    explicacao: 'Indício grave de "rachadinha", autocontratação velada por interposta pessoa jurídica ou apropriação indevida da cota para remunerar assessores.',
    mitigacao: 'Normalização estrita de nomes completos, desconsiderando homônimos comuns e comparando vínculos formais de lotação do gabinete.',
  },
  {
    id: 'CONTAS_IRREGULARES_TCU', icon: Landmark, sev: 'ALTA', peso: 40,
    titulo: 'Inidoneidade e Contas Julgadas Irregulares no TCU',
    resumo: 'Fornecedor condenado em processo de tomada de contas especial no Tribunal de Contas da União com declaração formal de inidoneidade.',
    origem: 'Tribunal de Contas da União (TCU - Cadastro de Inidôneos e Inabilitados)',
    gatilho: 'CNPJ_fornecedor IN cadastro_inidoneos_TCU\nAND total_pago_ceap > 0',
    explicacao: 'Condenação por tribunal de contas federal por desvio comprovado de recursos públicos ou superfaturamento em contratos federais.',
    mitigacao: 'Indexação exclusiva de acórdãos condenatórios transitados em julgado com efeitos vigentes de inidoneidade.',
  },
  {
    id: 'QUID_PRO_QUO_DOADOR_CAMPANHA', icon: Scale, sev: 'ALTA', peso: 35,
    titulo: 'Retorno de Campanha / Quid Pro Quo (Doador de Campanha Contratado via CEAP)',
    resumo: 'Fornecedor que realizou doações vultosas para a campanha eleitoral do deputado e, após a posse, passa a receber pagamentos recorrentes da cota.',
    origem: 'Tribunal Superior Eleitoral (TSE - Doações e Prestação de Contas) + Câmara (CEAP)',
    gatilho: 'cpf_cnpj_doador == cnpj_fornecedor_ceap\nAND valor_doado >= R$ 5.000,00\nAND total_recebido_ceap >= R$ 10.000,00',
    explicacao: 'Forte indício de favorecimento, restituição financeira de doação eleitoral com verba pública de custeio parlamentar e violação da impessoalidade.',
    mitigacao: 'Piso mínimo de materialidade financeira na doação (R$ 5.000) e na despesa (R$ 10.000) para evitar pequenos prestadores pontuais.',
  },
  {
    id: 'VINCULO_SOCIETARIO_OU_NEPOTISMO', icon: Users2, sev: 'ALTA', peso: 40,
    titulo: 'Quadro Societário (QSA) com vínculo de parentesco / autocontratação',
    resumo: 'Sócio ou administrador da empresa contratada no QSA da Receita Federal compartilha nome civil ou sobrenome familiar direto com o parlamentar.',
    origem: 'Receita Federal (QSA / BrasilAPI) + Câmara dos Deputados (Cadastro Parlamentar)',
    gatilho: 'nome_socio == nome_civil_deputado\nOR (sobrenome_familiar_socio == sobrenome_deputado AND fornecedor NOT IN (concessionárias, cias aéreas))\nAND total_contrato >= R$ 3.000,00',
    explicacao: 'Indício grave de favorecimento familiar, autocontratação velada por meio de pessoa jurídica ou direcionamento da cota para empresas de parentes.',
    mitigacao: 'Filtra e desconsidera sobrenomes patronímicos extremamente comuns (ex: Silva, Santos, Souza, Oliveira) para evitar falsos positivos acidentais.',
  },
  {
    id: 'CNAE_INCOMPATIVEL_ESTRITO', icon: AlertOctagon, sev: 'ALTA', peso: 35,
    titulo: 'Incompatibilidade estrita de CNAE com serviços intelectuais',
    resumo: 'Despesa de divulgação parlamentar ou consultoria faturada por empresa cujo ramo na Receita é de vestuário, mecânica, estética, açougue ou construção.',
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
    gatilho: 'mesmo fornecedor AND mesmo numero_documento AND contagem >= 2',
    explicacao: 'Cobrança duplicada pelo mesmo fato gerador de despesa, gerando duplo reembolso público.',
    mitigacao: 'Apenas notas com exatamente o mesmo número e mesmo CNPJ de emitente são computadas.',
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
    titulo: 'Patrimônio declarado elevado (TSE)',
    resumo: 'Patrimônio oficial pessoal declarado à Justiça Eleitoral superior a R$ 10 milhões.',
    origem: 'Tribunal Superior Eleitoral - TSE (DivulgaCandContas)',
    gatilho: 'patrimonio_declarado > R$ 10.000.000,00',
    explicacao: 'Ter patrimônio elevado não constitui irregularidade jurídica. Funciona como linha de base oficial para fiscalização e acompanhamento da evolução patrimonial.',
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
          <ShieldCheck className="w-4 h-4" /> Metodologia Forense v12 (39 Heurísticas Multi-Bases Ativas)
        </div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-3">Critérios de Auditoria & Fórmulas Forenses</h1>
        <p className="text-slate-600 text-lg leading-relaxed max-w-3xl">
          O <strong>Vigilante Parlamentar</strong> realiza fiscalização cívica automatizada cruzando dados da <strong>Câmara dos Deputados (CEAP e Folha Funcional SP/CNE)</strong>, <strong>Conselho Nacional de Justiça (CNJ DataJud)</strong>, <strong>Portal Nacional de Contratações Públicas (PNCP)</strong>, <strong>Controladoria-Geral da União (CGU - Emendas PIX, CEIS, CNEP e CEAF/DOU)</strong>, <strong>Senado Federal</strong>, <strong>Receita Federal (BrasilAPI/QSA)</strong> e <strong>Tribunal Superior Eleitoral (TSE)</strong>, aplicando filtros rigorosos de materialidade financeira e eliminação de falsos positivos.
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
          indice_risco = min(100.0, ∑ [ peso_regra × min(1 + 0.25 × (ocorrências - 1), 1.5) ])
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
            <p className="text-slate-400 text-xs">Indícios graves: fornecedor inidôneo na CGU/TCU, secretário sócio de fornecedor, empresas extintas ou teletransporte físico.</p>
          </div>
        </div>
      </section>

      {/* Regras */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 className="text-2xl font-bold text-slate-900">Catálogo das 39 Heurísticas Forenses Ativas</h2>
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
                    {h.sev === 'MEDIA' ? 'Média' : h.sev === 'ALTA' ? 'Alta' : 'Baixa'} — {h.peso} pts
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100 text-sm">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Fórmula de Gatilho</p>
                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded-xl text-xs font-mono whitespace-pre-wrap">{h.gatilho}</pre>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Base de Dados Consultada</p>
                    <p className="text-slate-700 font-semibold bg-slate-50 p-3 rounded-xl border border-slate-100">{h.origem}</p>
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
