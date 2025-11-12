import { GLView } from "expo-gl";
import React, { Component } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Platform,
  Vibration,
  View,
  useColorScheme,
} from "react-native";

import GestureRecognizer, { swipeDirections } from "@/components/GestureView";
import Score from "@/components/ScoreText";
import Engine from "@/GameEngine";
import State from "@/state";
import GameOverScreen from "@/screens/GameOverScreen";
import HomeScreen from "@/screens/HomeScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import GameContext from "@/context/GameContext";
import AudioManager from "@/AudioManager";

const DEBUG_CAMERA_CONTROLS = false;

class Game extends Component {
  /// Reserve State for UI related updates...
  state = {
    ready: false,
    score: 0,
    viewKey: 0,
    gameState: State.Game.none,
    showSettings: false,
    // gameState: State.Game.gameOver
  };

  transitionScreensValue = new Animated.Value(1);

  UNSAFE_componentWillReceiveProps(nextProps, nextState) {
    if (nextState.gameState && nextState.gameState !== this.state.gameState) {
      this.updateWithGameState(nextState.gameState, this.state.gameState);
    }
    if (this.engine && nextProps.character !== this.props.character) {
      this.engine._hero.setCharacter(nextProps.character);
    }
    // if ((this.state.gameState === State.Game.playing || this.state.gameState === State.Game.paused) && nextProps.isPaused !== this.props.isPaused) {
    //   this.setState({ gameState: nextProps.isPaused ? State.Game.paused : State.Game.playing })
    // }
    // if (nextProps.character.id !== this.props.character.id) {
    //   (async () => {
    //     this.world.remove(this._hero);
    //     this._hero = this.hero.getNode(nextProps.character.id);
    //     this.world.add(this._hero);
    //     this._hero.position.set(0, groundLevel, startingRow);
    //     this._hero.scale.set(1, 1, 1);
    //     this.init();
    //   })();
    // }
  }

  transitionToGamePlayingState = () => {
    Animated.timing(this.transitionScreensValue, {
      toValue: 0,
      useNativeDriver: true,
      duration: 200,
      onComplete: ({ finished }) => {
        this.engine.setupGame(this.props.character);
        this.engine.init();

        if (finished) {
          Animated.timing(this.transitionScreensValue, {
            toValue: 1,
            useNativeDriver: true,
            duration: 300,
          }).start();
        }
      },
    }).start();
  };

  updateWithGameState = (gameState) => {
    if (!gameState) throw new Error("gameState cannot be undefined");

    if (gameState === this.state.gameState) {
      return;
    }
    const lastState = this.state.gameState;

    this.setState({ gameState });
    this.engine.gameState = gameState;
    const { playing, gameOver, paused, none } = State.Game;
    switch (gameState) {
      case playing:
        if (lastState === paused) {
          this.engine.unpause();
        } else if (lastState !== none) {
          this.transitionToGamePlayingState();
        } else {
          // Coming straight from the menu.
          this.engine._hero.stopIdle();
          this.onSwipe(swipeDirections.SWIPE_UP);
        }
        AudioManager.playBackgroundAsync();

        break;
      case gameOver:
        AudioManager.pauseBackgroundAsync();
        break;
      case paused:
        this.engine.pause();
        AudioManager.pauseBackgroundAsync();
        break;
      case none:
        if (lastState === gameOver) {
          this.transitionToGamePlayingState();
        }
        this.newScore();
        AudioManager.stopBackgroundAsync();

        break;
      default:
        break;
    }
  };

  async componentDidMount() {
    // AudioManager.sounds.bg_music.setVolumeAsync(0.05);
    // await AudioManager.playAsync(
    //   AudioManager.sounds.bg_music, true
    // );

    Dimensions.addEventListener("change", this.onScreenResize);

    // Only on web: listen to mouse wheel to zoom the orthographic camera
    if (typeof window !== "undefined") {
      this._onWheel = (ev: WheelEvent) => {
        if (this.state.gameState === State.Game.none && this.engine && this.engine.camera) {
          this.engine.camera.adjustZoomByDelta(ev.deltaY);
          ev.preventDefault();
        }
      };
      window.addEventListener("wheel", this._onWheel, { passive: false });

      let isDragging = false;
      let lastX = 0;
      let lastY = 0;
      let button: number | null = null; // 0:left 1:middle 2:right
      const getViewport = () => {
        const w = window.innerWidth || 1;
        const h = window.innerHeight || 1;
        return { w, h };
      };
      this._onMouseDown = (ev: MouseEvent) => {
        if (this.state.gameState !== State.Game.none) return;
        isDragging = true;
        lastX = ev.clientX;
        lastY = ev.clientY;
        button = ev.button;
      };
      this._onMouseMove = (ev: MouseEvent) => {
        if (!isDragging || this.state.gameState !== State.Game.none) return;
        if (!this.engine || !this.engine.camera) return;
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        if (button === 0) {
          // Left: orbit rotate
          const ROTATE_SPEED = 0.005;
          this.engine.camera.orbitBy(-dx * ROTATE_SPEED, -dy * ROTATE_SPEED);
        } else if (button === 2) {
          // Right: pan
          const { w, h } = getViewport();
          this.engine.camera.panByPixels(dx, dy, w, h);
        }
      };
      this._onMouseUp = () => {
        isDragging = false;
        button = null;
      };
      this._onContextMenu = (ev: MouseEvent) => {
        if (this.state.gameState === State.Game.none) {
          ev.preventDefault(); // disable context menu on drag
        }
      };
      this._onAuxClick = (ev: MouseEvent) => {
        if (this.state.gameState !== State.Game.none) return;
        // Middle button click to reset camera
        if (ev.button === 1 && this.engine && this.engine.camera) {
          this.engine.camera.resetOrbitAndZoom();
          ev.preventDefault();
        }
      };
      window.addEventListener("mousedown", this._onMouseDown);
      window.addEventListener("mousemove", this._onMouseMove);
      window.addEventListener("mouseup", this._onMouseUp);
      window.addEventListener("contextmenu", this._onContextMenu);
      window.addEventListener("auxclick", this._onAuxClick);
    }
  }

  onScreenResize = ({ window }) => {
    this.engine.updateScale();
  };

  componentWillUnmount() {
    cancelAnimationFrame(this.engine.raf);
    AudioManager.stopBackgroundAsync();
    Dimensions.removeEventListener("change", this.onScreenResize);
    if (typeof window !== "undefined") {
      if (this._onWheel) window.removeEventListener("wheel", this._onWheel as any);
      if (this._onMouseDown) window.removeEventListener("mousedown", this._onMouseDown as any);
      if (this._onMouseMove) window.removeEventListener("mousemove", this._onMouseMove as any);
      if (this._onMouseUp) window.removeEventListener("mouseup", this._onMouseUp as any);
      if (this._onContextMenu) window.removeEventListener("contextmenu", this._onContextMenu as any);
      if (this._onAuxClick) window.removeEventListener("auxclick", this._onAuxClick as any);
    }
  }

  UNSAFE_componentWillMount() {
    this.engine = new Engine();
    // this.engine.hideShadows = this.hideShadows;
    this.engine.onUpdateScore = (position) => {
      if (this.state.score < position) {
        this.setState({ score: position });
      }
    };
    this.engine.onGameInit = () => {
      this.setState({ score: 0 });
    };
    this.engine._isGameStateEnded = () => {
      return this.state.gameState !== State.Game.playing;
    };
    this.engine.onGameReady = () => this.setState({ ready: true });
    this.engine.onGameEnded = () => {
      this.setState({ gameState: State.Game.gameOver });
      // this.props.navigation.navigate('GameOver')
    };
    this.engine.setupGame(this.props.character);
    this.engine.init();
  }

  newScore = () => {
    Vibration.cancel();
    // this.props.setGameState(State.Game.playing);
    this.setState({ score: 0 });
    this.engine.init();
  };

  onSwipe = (gestureName) => this.engine.moveWithDirection(gestureName);

  renderGame = () => {
    if (!this.state.ready) return;

    return (
      <GestureView
        pointerEvents={DEBUG_CAMERA_CONTROLS ? "none" : undefined}
        onStartGesture={this.engine.beginMoveWithDirection}
        onSwipe={this.onSwipe}
      >
        <GLView
          style={{ flex: 1, height: "100%", overflow: "hidden" }}
          onContextCreate={this.engine._onGLContextCreate}
        />
      </GestureView>
    );
  };

  renderGameOver = () => {
    if (this.state.gameState !== State.Game.gameOver) {
      return null;
    }

    return (
      <View style={StyleSheet.absoluteFillObject}>
        <GameOverScreen
          showSettings={() => {
            this.setState({ showSettings: true });
          }}
          setGameState={(state) => {
            this.updateWithGameState(state);
          }}
        />
      </View>
    );
  };

  renderHomeScreen = () => {
    if (this.state.gameState !== State.Game.none) {
      return null;
    }

    return (
      <View style={StyleSheet.absoluteFillObject}>
        <HomeScreen
          onPlay={() => {
            this.updateWithGameState(State.Game.playing);
          }}
        />
      </View>
    );
  };

  renderSettingsScreen() {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <SettingsScreen goBack={() => this.setState({ showSettings: false })} />
      </View>
    );
  }

  render() {
    const { isDarkMode, isPaused } = this.props;

    return (
      <View
        pointerEvents="box-none"
        style={[
          StyleSheet.absoluteFill,
          { flex: 1, backgroundColor: "#87C6FF" },
          Platform.select({
            web: { position: "fixed" },
            default: { position: "absolute" },
          }),
          this.props.style,
        ]}
      >
        <Animated.View
          style={{ flex: 1, opacity: this.transitionScreensValue }}
        >
          {this.renderGame()}
        </Animated.View>
        <Score
          score={this.state.score}
          gameOver={this.state.gameState === State.Game.gameOver}
        />
        {this.renderGameOver()}

        {this.renderHomeScreen()}

        {this.state.showSettings && this.renderSettingsScreen()}

        {isPaused && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: "rgba(105, 201, 230, 0.8)",
                justifyContent: "center",
                alignItems: "center",
              },
            ]}
          />
        )}
      </View>
    );
  }
}

const GestureView = ({ onStartGesture, onSwipe, ...props }) => {
  const config = {
    velocityThreshold: 0.2,
    directionalOffsetThreshold: 80,
  };

  return (
    <GestureRecognizer
      onResponderGrant={() => {
        onStartGesture();
      }}
      onSwipe={(direction) => {
        onSwipe(direction);
      }}
      config={config}
      onTap={() => {
        onSwipe(swipeDirections.SWIPE_UP);
      }}
      style={{ flex: 1 }}
      {...props}
    />
  );
};

function GameScreen(props) {
  const scheme = useColorScheme();
  const { character } = React.useContext(GameContext);

  return (
    <Game {...props} character={character} isDarkMode={scheme === "dark"} />
  );
}

export default GameScreen;
