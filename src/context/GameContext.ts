import { createContext } from 'react';
type GameContextType = {
  character: string;
  setCharacter: (character: string) => void;
  highscore: number;
  setHighscore: (highscore: number) => void;
};

export default createContext<GameContextType>({ character: 'avocoder', setCharacter: () => {}, highscore: 0, setHighscore: () => {}, });
