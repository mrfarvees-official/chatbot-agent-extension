type WindowBounds = { left?: number; top?: number; width?: number; height?: number };

export function centeredPopupBounds(parent: WindowBounds) {
  const parentWidth = parent.width && parent.width > 0 ? parent.width : 480;
  const parentHeight = parent.height && parent.height > 0 ? parent.height : 520;
  const width = Math.min(480, parentWidth);
  const height = Math.min(520, parentHeight);
  return {
    width,
    height,
    left: Math.round((parent.left ?? 0) + (parentWidth - width) / 2),
    top: Math.round((parent.top ?? 0) + (parentHeight - height) / 2),
  };
}
