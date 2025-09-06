import Generic from './Generic';

export default class LilyPad extends Generic {
  setup = async (): Promise<void> => {
    const {
      environment: { lily_pad },
    } = this.globalModels;

    await this._register(`0`, {
      ...lily_pad,
      castShadow: true,
      receiveShadow: true,
    });
    return;
  };
}
