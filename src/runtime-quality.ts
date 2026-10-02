/** Only decorations adapt. Long suspensions are not evidence of sustained load. */
export class RuntimeQuality {
  level = 0;
  private slow = 0;
  private fast = 0;
  private cooldown = 0;

  sample(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 250) return;
    const seconds = milliseconds / 1000;
    this.cooldown = Math.max(0, this.cooldown - seconds);
    this.slow = milliseconds > 22 ? this.slow + seconds : Math.max(0, this.slow - seconds);
    this.fast = milliseconds < 18 ? this.fast + seconds : 0;
    if (this.cooldown) return;
    if (this.slow >= 1 && this.level < 2) {
      this.level++;
      this.changed();
    } else if (this.fast >= 6 && this.level > 0) {
      this.level--;
      this.changed();
    }
  }

  private changed() {
    this.slow = this.fast = 0;
    this.cooldown = 4;
  }
}
