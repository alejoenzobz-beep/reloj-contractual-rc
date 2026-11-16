// Lámina de demostración E-301 en revisiones A y B (generada para el ejemplo; proyecto ficticio R1).
// Cambios entre A y B: peralte de V-1 (0,60 → 0,70 m), acero inferior de V-3 (3 Ø 5/8" → 4 Ø 3/4"),
// nota de concreto en vigas (f'c 280 → 350 kg/cm²) y el rótulo (sin impacto).
export const W = 1200, H = 800;

export function laminaSVG(rev) {
  const B = rev === 'B';
  const tinta = '#1D2B53', suave = '#5B6A8F', papel = '#F7F9FC';
  const t = (x, y, s, txt, extra = '') => `<text x="${x}" y="${y}" font-size="${s}" ${extra}>${txt}</text>`;
  // planta: ejes 1..4 (x) y A..C (y)
  const ex = [100, 300, 500, 680], ey = [150, 320, 490];
  let planta = '';
  ex.forEach((x, i) => { planta += `<line x1="${x}" y1="110" x2="${x}" y2="530" stroke="${suave}" stroke-dasharray="10 4 2 4"/><circle cx="${x}" cy="92" r="14" fill="${papel}" stroke="${tinta}"/>${t(x, 97, 14, i + 1, 'text-anchor="middle"')}`; });
  ey.forEach((y, i) => { planta += `<line x1="70" y1="${y}" x2="710" y2="${y}" stroke="${suave}" stroke-dasharray="10 4 2 4"/><circle cx="52" cy="${y}" r="14" fill="${papel}" stroke="${tinta}"/>${t(52, y + 5, 14, 'ABC'[i], 'text-anchor="middle"')}`; });
  ey.forEach(y => { planta += `<rect x="${ex[0]}" y="${y - 6}" width="${ex[3] - ex[0]}" height="12" fill="#DCE3F2" stroke="${tinta}"/>`; });
  ex.forEach(x => { planta += `<rect x="${x - 6}" y="${ey[0]}" width="12" height="${ey[2] - ey[0]}" fill="#DCE3F2" stroke="${tinta}"/>`; });
  ex.forEach(x => ey.forEach(y => { planta += `<rect x="${x - 15}" y="${y - 15}" width="30" height="30" fill="${tinta}"/>`; }));
  planta += t(200, 140, 13, 'V-1', 'text-anchor="middle" font-weight="700"') + t(400, 310, 13, 'V-2', 'text-anchor="middle" font-weight="700"') + t(590, 480, 13, 'V-3', 'text-anchor="middle" font-weight="700"');

  // sección V-1
  const sx = 940, sy = 140, sw = 90, sh = B ? 210 : 180;
  const barras = (y, n) => Array.from({ length: n }, (_, k) => `<circle cx="${sx + 16 + k * (sw - 32) / (n - 1)}" cy="${y}" r="5.5" fill="${tinta}"/>`).join('');
  const seccion = `${t(985, 112, 15, 'SECCIÓN V-1 · ESC. 1:25', 'text-anchor="middle" font-weight="700"')}
    <rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="#E4E9F4" stroke="${tinta}" stroke-width="2.5"/>
    <rect x="${sx + 8}" y="${sy + 8}" width="${sw - 16}" height="${sh - 16}" fill="none" stroke="${tinta}" stroke-width="1.2"/>
    ${barras(sy + 16, 3)}${barras(sy + sh - 16, 3)}
    <line x1="${sx + sw + 18}" y1="${sy}" x2="${sx + sw + 18}" y2="${sy + sh}" stroke="${tinta}"/><line x1="${sx + sw + 12}" y1="${sy}" x2="${sx + sw + 24}" y2="${sy}" stroke="${tinta}"/><line x1="${sx + sw + 12}" y1="${sy + sh}" x2="${sx + sw + 24}" y2="${sy + sh}" stroke="${tinta}"/>
    ${t(985, 378, 13, `SECCIÓN V-1 · b × h = 0,30 × ${B ? '0,70' : '0,60'} m`, 'text-anchor="middle"')}`;

  // cuadro de vigas
  const cx = [80, 190, 330, 470, 610];
  const fila = (y, celdas, peso = '') => celdas.map((c, i) => t(cx[i], y, 13, c, peso)).join('');
  const cuadro = `${t(80, 585, 15, 'CUADRO DE VIGAS · NIVEL TÍPICO', 'font-weight="700"')}
    <rect x="66" y="596" width="660" height="118" fill="none" stroke="${tinta}"/><line x1="66" y1="622" x2="726" y2="622" stroke="${tinta}"/>
    ${fila(614, ['VIGA', 'b × h (m)', 'ACERO SUPERIOR', 'ACERO INFERIOR', 'ESTRIBOS'], 'font-weight="700"')}
    ${fila(645, ['V-1', `0,30 × ${B ? '0,70' : '0,60'}`, '3 Ø 5/8"', '3 Ø 5/8"', 'Ø 3/8" @ 0,15'])}
    ${fila(672, ['V-2', '0,25 × 0,50', '2 Ø 5/8"', '2 Ø 5/8"', 'Ø 3/8" @ 0,15'])}
    ${fila(699, ['V-3', '0,30 × 0,60', '3 Ø 5/8"', B ? '4 Ø 3/4"' : '3 Ø 5/8"', 'Ø 3/8" @ 0,15'])}`;

  // notas
  const notas = `${t(800, 440, 15, 'NOTAS GENERALES', 'font-weight="700"')}
    ${t(800, 466, 12.5, 'NOTA 1: ACERO CORRUGADO fy = 4200 kg/cm².')}
    ${t(800, 488, 12.5, `NOTA 2: CONCRETO EN VIGAS f'c = ${B ? '350' : '280'} kg/cm².`)}
    ${t(800, 510, 12.5, 'NOTA 3: RECUBRIMIENTO LIBRE EN VIGAS 4 cm.')}
    ${t(800, 532, 12.5, 'NOTA 4: VER EMPALMES EN LÁMINA E-320.')}`;

  // rótulo y cuadro de revisiones
  const rotulo = `<rect x="780" y="610" width="390" height="160" fill="none" stroke="${tinta}" stroke-width="2"/>
    <line x1="780" y1="690" x2="1170" y2="690" stroke="${tinta}"/>
    ${t(796, 634, 12, 'CUADRO DE REVISIONES', 'font-weight="700"')}
    ${t(796, 656, 11.5, 'REV. A: EMISIÓN PARA CONSTRUCCIÓN')}
    ${B ? t(796, 676, 11.5, 'REV. B: SE ACTUALIZA CUADRO DE VIGAS') : ''}
    ${t(796, 714, 13, 'EDIFICIO MULTIFAMILIAR R1 · DEMOSTRACIÓN', 'font-weight="700"')}
    ${t(796, 736, 12, 'LÁMINA E-301 · VIGAS DEL NIVEL TÍPICO · ESTRUCTURAS')}
    ${t(796, 758, 12, `REVISIÓN ${B ? 'B · 07/10/2026' : 'A · 02/10/2026'} · ESCALA INDICADA`)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial, Helvetica, sans-serif" fill="${tinta}">
  <rect width="${W}" height="${H}" fill="${papel}"/><rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="${tinta}" stroke-width="3"/>
  ${t(60, 60, 17, 'PLANTA DE VIGAS · NIVEL TÍPICO (2.º AL 12.º PISO)', 'font-weight="700"')}
  ${planta}${seccion}${cuadro}${notas}${rotulo}
</svg>`;
}

export const DOC_DEMO = {
  doc_id: 'E-301', tipo: 'Lámina', titulo: 'Vigas del nivel típico', especialidad: 'Estructuras',
  revision: 'B', revision_anterior: 'A', emisor: 'Proyectista de estructuras (demostración)',
};
