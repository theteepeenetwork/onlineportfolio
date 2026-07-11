// Per-class tints, cycled by class position, so a class reads with the same
// colour everywhere (My classes cards, calendar entries…). `color` is the soft
// fill; `jarFill` the accent used inside jar marks.
export const CLASS_TINTS = [
  { color: "#F3E3C3", jarFill: "#C2476B" }, // kraft / jam
  { color: "#D8ECE8", jarFill: "#4E9C94" }, // glass
  { color: "#F7E0E6", jarFill: "#E08A9B" }, // pink
  { color: "#FBEED3", jarFill: "#F0B441" }, // honey
  { color: "#E7DEF3", jarFill: "#B99CD6" }, // lilac
];

export const classTint = (index: number) => CLASS_TINTS[index % CLASS_TINTS.length];
