export function getDeviceBadgeColor(deviceType: string): 'green' | 'blue' | 'zinc' {
  if (deviceType === 'nvidia') return 'green';
  if (deviceType === 'mps') return 'blue';
  return 'zinc';
}
