import { ENV } from "./_core/env";

export type OneDriveSourceStatus = {
  configured: boolean;
  reachable: boolean;
  status: number | null;
  location: string | null;
  folderScope: "01_Importacoes_Originais";
  listingAvailable: false;
  message: string;
};

export async function getOneDriveSourceStatus(): Promise<OneDriveSourceStatus> {
  const link = ENV.onedriveImportsLink;
  if (!link) {
    return {
      configured: false,
      reachable: false,
      status: null,
      location: null,
      folderScope: "01_Importacoes_Originais",
      listingAvailable: false,
      message: "A origem do OneDrive ainda não foi configurada.",
    };
  }

  try {
    const response = await fetch(link, { method: "HEAD", redirect: "manual" });
    const location = response.headers.get("location");
    const reachable = response.status >= 300 && response.status < 400 && Boolean(location);
    return {
      configured: true,
      reachable,
      status: response.status,
      location,
      folderScope: "01_Importacoes_Originais",
      listingAvailable: false,
      message: reachable
        ? "A pasta compartilhada está acessível. A leitura de arquivos continuará semiassistida: abra a pasta, baixe o arquivo e envie-o para validação."
        : "O link está configurado, mas a Microsoft não confirmou o redirecionamento público. Use o envio manual enquanto a origem estiver indisponível.",
    };
  } catch {
    return {
      configured: true,
      reachable: false,
      status: null,
      location: null,
      folderScope: "01_Importacoes_Originais",
      listingAvailable: false,
      message: "Não foi possível consultar o link agora. O envio manual continua disponível.",
    };
  }
}

export function getOneDriveImportsLink() {
  return ENV.onedriveImportsLink || null;
}
