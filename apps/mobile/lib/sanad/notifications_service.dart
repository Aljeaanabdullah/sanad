import 'package:supabase_flutter/supabase_flutter.dart';

/// One in-app notification (PRD 18.2), built by the server from the employee's own rows.
/// kind: request_decided | late | leave_recorded | penalty_recorded | bonus_list
class NoticeItem {
  const NoticeItem({required this.kind, required this.at, required this.data});
  final String kind;
  final DateTime at;
  final Map<String, dynamic> data;

  factory NoticeItem.fromRow(Map<String, dynamic> r) => NoticeItem(
        kind: r['kind'] as String,
        at: DateTime.parse(r['at'] as String).toLocal(),
        data: Map<String, dynamic>.from(r['data'] as Map? ?? const {}),
      );
}

abstract class NotificationsService {
  Future<List<NoticeItem>> mine();
}

class SupabaseNotificationsService implements NotificationsService {
  SupabaseNotificationsService(this._client);
  final SupabaseClient _client;

  @override
  Future<List<NoticeItem>> mine() async {
    final rows = await _client.rpc('my_notifications', params: {'p_limit': 40}) as List;
    return rows.map((r) => NoticeItem.fromRow(Map<String, dynamic>.from(r as Map))).toList();
  }
}
