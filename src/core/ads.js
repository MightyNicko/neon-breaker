// Ad provider interface. The web build uses a stub; a native wrapper (e.g. Capacitor)
// can later replace `rewarded` with a real SDK call without touching the UI.
export const adProvider = {
  // Resolves true if the user earned the reward. onTick(secondsLeft) drives the UI.
  rewarded(onTick) {
    return new Promise((resolve) => {
      let s = 5;
      onTick(s);
      const id = setInterval(() => {
        s -= 1;
        if (s <= 0) { clearInterval(id); resolve(true); } else onTick(s);
      }, 1000);
    });
  },
};
