import {
  getCostEvolutionAnalise as getLegacyAnalise,
  getCostEvolutionItens as getLegacyItens,
} from './costEvolutionAnalise';
import {
  getCostEvolutionAnalise as getIndustryAnalise,
  getCostEvolutionItens as getIndustryItens,
} from './industryCostEvolutionAnalise';
export { getCodAgregados, getCodAgregadosComDescricao, getFiliais, getPeriodos } from './costEvolutionAnalise';

/** Autopeças segue literalmente o motor validado; só a Indústria usa a base salva. */
export async function getCostEvolutionAnalise(params: Parameters<typeof getLegacyAnalise>[0]) {
  return params.segment === 'industry' ? getIndustryAnalise(params) : getLegacyAnalise(params);
}
export async function getCostEvolutionItens(params: Parameters<typeof getLegacyItens>[0]) {
  return params.segment === 'industry' ? getIndustryItens(params) : getLegacyItens(params);
}
