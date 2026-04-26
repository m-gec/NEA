
//creates a dom element with class and text
export const mk = (tag, cls, text) => {
  const el = document.createElement(tag);
  
  //apply class name if one was passed in
  if (cls) el.className = cls;

  //allow empty strings, but ignore null or undefined text
  if (text != null) el.textContent = text;
  return el;
};


//binds the space key to toggle debug rendering
export function bindDebugMode(state, camera) {
  window.addEventListener('keydown', (e) => {

    //only toggle once per key press, not while the key repeats
    if (e.code === 'Space' && !e.repeat) {
      state.value = !state.value;

      //restart accumulation so the view updates cleanly
      camera.sampleIndex = 0;

      //stop the browser from scrolling
      e.preventDefault();
    }
  });
}
