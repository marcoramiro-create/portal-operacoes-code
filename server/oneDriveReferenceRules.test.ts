import { describe, it, expect } from "vitest";
import { selectReferenceFile, prepareReference } from "./oneDriveReferenceRules";
const sb1 = Buffer.from('SB1\n\nCodigo;Cod Agregado;Descricao;Tipo;Familia;Sub-familia\n00000136-MGT;00000136;Produto A;ME;0000002;0000002\n');
const sbz = Buffer.from('SBZ\n\nFilial;Codigo;Estoq Minimo;Estoq Maximo;Entra MRP\n105;00000136;2,5;10;Sim\n');
const zfm = Buffer.from('Famílias\n\nExportação\nCódigo;Descrição\n0000002;ACESSORIOS\n');
const zsf = Buffer.from('SubFamília\n\nExportação\nCódigo;Descrição\n0000046;DESCRIÇÃO  COM DOIS ESPAÇOS\n');
describe("OneDrive SB1/SBZ", () => {
  it("usa somente CSV da subpasta autorizada e escolhe o mais recente", () => {
    const file={id:'a',name:'SB1.csv',folderName:'SB1',size:10,modifiedAt:'2026-10-09T00:00:00Z'};
    expect(selectReferenceFile([file,{...file,id:'b',modifiedAt:'2026-10-10T00:00:00Z'},{...file,id:'xml',name:'NF.xml'}], 'SB1').id).toBe('b');
    expect(() => selectReferenceFile([{...file,folderName:'Email attachments'}], 'SB1')).toThrow();
  });
  it("preserva prioridade do agregado na referência de Compras", () => {
    const p=prepareReference('SB1',sb1);
    expect(p.sb1[0]).toMatchObject({code:'136',tipo:'ME',familiaCode:'2'});
    expect(p.hash).toHaveLength(64);
    expect(prepareReference('SB1',sb1).hash).toBe(p.hash);
  });
  it("normaliza filial e código como o importador existente", () => {
    expect(prepareReference('SBZ',sbz).sbz[0]).toMatchObject({code:'136',filial:'0105',chave:'1360105',estoqMin:'2.5',entraMrp:'Sim'});
  });
  it("bloqueia arquivo vazio ou sem cabeçalho antes de gravar", () => {
    expect(() => prepareReference('SB1',Buffer.from('invalido'))).toThrow();
    expect(() => prepareReference('SBZ',Buffer.from('SBZ\n\nFilial;Codigo;Entra MRP\n'))).toThrow();
  });
  it("bloqueia duplicidades e notação científica", () => {
    expect(() => prepareReference('SB1',Buffer.concat([sb1,Buffer.from('00000136-MGT;00000136;Produto A;ME;2;2\n')]))).toThrow();
    expect(() => prepareReference('SB1',Buffer.from('Codigo;Cod Agregado;Descricao\n1E+12;136;Produto\n'))).toThrow();
  });
  it("seleciona XLSX nas subpastas ZFM e ZSF, sem aceitar CSV como fonte delas", () => {
    const zfmFile={id:'zfm',name:'Famílias.xlsx',folderName:'ZFM',size:100,modifiedAt:'2026-10-29T00:00:00Z'};
    const zsfFile={id:'zsf',name:'SubFamília.xlsx',folderName:'ZSF',size:100,modifiedAt:'2026-10-29T00:00:00Z'};
    expect(selectReferenceFile([zfmFile,{...zfmFile,id:'csv',name:'ZFM.csv'}], 'ZFM').id).toBe('zfm');
    expect(selectReferenceFile([zsfFile], 'ZSF').name).toBe('SubFamília.xlsx');
  });
  it("prepara ZFM e ZSF preservando os códigos e a descrição", () => {
    expect(prepareReference('ZFM', zfm).catalog).toEqual([{ code: '0000002', descricao: 'ACESSORIOS' }]);
    expect(prepareReference('ZSF', zsf).catalog).toEqual([{ code: '0000046', descricao: 'DESCRIÇÃO  COM DOIS ESPAÇOS' }]);
  });
});
