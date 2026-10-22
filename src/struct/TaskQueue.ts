class Task {
  resolve!: () => void;
  promise: Promise<void>;
  isPlay: boolean;
  constructor(isPlay: boolean) {
    this.isPlay = isPlay;
    this.promise = new Promise<void>(res => {
      this.resolve = res;
    });
  }
}

/**
 * Task queuing system
 *
 * It makes sure that the tasks of a {@link Queue} are processed one after the
 * other, instead of all at the same time.
 */
export class TaskQueue {
  /**
   * The task array
   */
  #tasks: Task[] = [];

  /**
   * Waits for last task finished and queues a new task
   * @param isPlay - Whether the task is a play task
   * @returns A promise that resolves when the last queued task is finished
   */
  queuing(isPlay = false): Promise<void> {
    const next = this.remaining ? this.#tasks[this.#tasks.length - 1].promise : Promise.resolve();
    this.#tasks.push(new Task(isPlay));
    return next;
  }

  /**
   * Removes the finished task and processes the next task
   * @returns Nothing
   */
  resolve(): void {
    this.#tasks.shift()?.resolve();
  }

  /**
   * The remaining number of tasks
   */
  get remaining(): number {
    return this.#tasks.length;
  }

  /**
   * Whether or not having a play task
   */
  get hasPlayTask(): boolean {
    return this.#tasks.some(t => t.isPlay);
  }
}
