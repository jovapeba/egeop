import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/app_config.dart';
import '../storage/token_storage.dart';

final socketServiceProvider = Provider<SocketService>((ref) {
  final tokenStorage = ref.watch(tokenStorageProvider);
  return SocketService(tokenStorage);
});

class SocketService {
  final TokenStorage _tokenStorage;
  io.Socket? _battleSocket;
  io.Socket? _chatSocket;

  SocketService(this._tokenStorage);

  io.Socket getBattleSocket() {
    if (_battleSocket == null) {
      _battleSocket = io.io(
        AppConfig.wsBaseUrl,
        io.OptionBuilder()
            .setTransports(['websocket'])
            .disableAutoConnect()
            .build(),
      );
      _battleSocket!.connect();
    }
    return _battleSocket!;
  }

  Future<io.Socket> getChatSocket() async {
    final token = await _tokenStorage.getToken();
    if (_chatSocket == null) {
      _chatSocket = io.io(
        AppConfig.wsBaseUrl,
        io.OptionBuilder()
            .setTransports(['websocket'])
            .setAuth(token != null ? {'token': token} : {})
            .disableAutoConnect()
            .build(),
      );
      _chatSocket!.connect();
    } else if (token != null) {
      _chatSocket!.io.options?['auth'] = {'token': token};
    }
    return _chatSocket!;
  }

  void dispose() {
    _battleSocket?.disconnect();
    _battleSocket?.dispose();
    _battleSocket = null;

    _chatSocket?.disconnect();
    _chatSocket?.dispose();
    _chatSocket = null;
  }
}
