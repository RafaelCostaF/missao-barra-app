// Fundos prontos (fotos do kit da marca, edições anteriores no Farol da Barra).
export interface ShareBackground {
  key: string;
  label: string;
  full: number;
  thumb: number;
}

export const SHARE_BACKGROUNDS: ShareBackground[] = [
  { key: 'farol-orla', label: 'Farol e mar', full: require('../../../assets/share/farol-orla.jpg'), thumb: require('../../../assets/share/farol-orla-thumb.jpg') },
  { key: 'ed5-chegada', label: 'Chegada', full: require('../../../assets/share/ed5-chegada.jpg'), thumb: require('../../../assets/share/ed5-chegada-thumb.jpg') },
  { key: 'ed4-medalha', label: 'Medalha', full: require('../../../assets/share/ed4-medalha.jpg'), thumb: require('../../../assets/share/ed4-medalha-thumb.jpg') },
  { key: 'ed3-farol', label: 'Forte', full: require('../../../assets/share/ed3-farol.jpg'), thumb: require('../../../assets/share/ed3-farol-thumb.jpg') },
  { key: 'ed4-farol', label: 'Céu azul', full: require('../../../assets/share/ed4-farol.jpg'), thumb: require('../../../assets/share/ed4-farol-thumb.jpg') },
];
