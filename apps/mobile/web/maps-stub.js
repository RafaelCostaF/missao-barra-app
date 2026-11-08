// Mapa falso para a prévia web: caixa cinza do mesmo tamanho (o layout ao redor é o que importa).
const React = require('react');
const { View, Text } = require('react-native');

const MapView = React.forwardRef(function MapView({ style, children }, ref) {
  React.useImperativeHandle(ref, () => ({ animateCamera() {}, animateToRegion() {}, fitToCoordinates() {}, getCamera: async () => ({ heading: 0 }) }));
  return React.createElement(View, { style: [{ backgroundColor: '#dfe6e0', alignItems: 'center', justifyContent: 'center' }, style] },
    React.createElement(Text, { style: { color: '#7a8a80', fontSize: 12 } }, 'mapa'), children);
});
const Nothing = React.forwardRef(function Nothing() { return null; });
module.exports = MapView;
module.exports.default = MapView;
module.exports.Marker = Nothing;
module.exports.Polyline = Nothing;
module.exports.Callout = Nothing;
module.exports.PROVIDER_GOOGLE = 'google';
