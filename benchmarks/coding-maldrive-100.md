# Maldrive 100-task coding capability test

Method: implement fix, `dart analyze <file>` clean for that rule (or test green for T-tasks). WITHOUT and WITH columns take PASS/FAIL + tries. Pilot 5v5 done 2026-09-29.
| ID | Task | Verify | WITHOUT | WITH |
|---|---|---|---|---|
| C-01 | lint features/explore/chris/screens/add_video_screen.dart:8 unused_import iconsax_plus | dart analyze file clean |  |  |
| C-02 | lint features/explore/chris/screens/add_video_screen.dart:10 unused_import app_colors | dart analyze file clean | PASS 1 try |  |
| C-03 | lint features/explore/chris/screens/add_video_screen.dart:11 unused_import chris constants | dart analyze file clean |  |  |
| C-04 | lint features/explore/chris/screens/add_video_screen.dart:42 unused_field _effectCategory | dart analyze file clean |  |  |
| C-05 | lint features/explore/chris/screens/add_video_screen.dart:877 unused_element _railButton | dart analyze file clean |  |  |
| C-06 | lint features/explore/chris/screens/add_video_screen.dart:916 unused_element _lenChip | dart analyze file clean |  |  |
| C-07 | lint screens/jobs/screens/tabs/jobs_feed_tab.dart:1 unused_import cached_network_image | dart analyze file clean |  | PASS 1 try, flutter-dart-code-review |
| C-08 | lint features/explore/chris/controllers/comment_controller.dart:13 missing type annotation | dart analyze file clean | PASS 1 try |  |
| C-09 | lint features/explore/chris/controllers/comment_controller.dart:18 missing type annotation | dart analyze file clean |  |  |
| C-10 | lint features/explore/chris/controllers/comment_controller.dart:26 missing type annotation | dart analyze file clean |  |  |
| C-11 | lint features/explore/chris/controllers/comment_controller.dart:71 missing type annotation | dart analyze file clean |  |  |
| C-12 | lint features/explore/chris/controllers/profile_controller.dart:75 prefer_final_fields _uid | dart analyze file clean |  | PASS 1 try, ponytail |
| C-13 | lint features/explore/chris/controllers/profile_controller.dart:84 missing type annotation | dart analyze file clean |  |  |
| C-14 | lint features/explore/chris/controllers/profile_controller.dart:495 unintended_html doc | dart analyze file clean |  |  |
| C-15 | lint features/explore/chris/controllers/profile_controller.dart:510 unintended_html doc x2 | dart analyze file clean |  |  |
| C-16 | lint features/explore/chris/controllers/profile_controller.dart:526 missing type annotation | dart analyze file clean |  |  |
| C-17 | lint features/explore/chris/models/comment.dart:4 prefer_typing_uninitialized | dart analyze file clean | PASS 1 try |  |
| C-18 | lint features/explore/chris/r2_media.dart:3 depend_on_referenced_packages crypto | dart analyze file clean |  | PASS 1 try, flutter-dart-code-review |
| C-19 | lint features/explore/chris/screens/add_video_screen.dart:3 unnecessary_import dart:typed_data | dart analyze file clean |  |  |
| C-20 | lint features/explore/chris/screens/add_video_screen.dart:42 prefer_final_fields _effectCategory | dart analyze file clean |  |  |
| C-21 | lint features/explore/chris/screens/add_video_screen.dart:421 use_build_context_synchronously | dart analyze file clean |  |  |
| C-22 | lint features/explore/chris/screens/sections/effects_sheet.dart:12 use_key_in_widget_constructors | dart analyze file clean | PASS 1 try |  |
| C-23 | lint features/explore/chris/screens/sections/effects_sheet.dart:133 use_key_in_widget_constructors | dart analyze file clean |  |  |
| C-24 | lint features/explore/chris/screens/sections/effects_sheet.dart:187 use_build_context_synchronously | dart analyze file clean |  |  |
| C-25 | lint features/explore/chris/screens/sections/upload_sheet.dart:12 use_key_in_widget_constructors | dart analyze file clean |  |  |
| C-26 | lint features/explore/chris/screens/sections/upload_sheet.dart:175 use_build_context_synchronously | dart analyze file clean |  | PASS 1 try, flutter-expert |
| C-27 | lint features/explore/chris/screens/sections/upload_sheet.dart:182 use_build_context_synchronously | dart analyze file clean |  |  |
| C-28 | lint features/explore/chris/widgets/circle_animation.dart:5 use_super_parameters | dart analyze file clean |  |  |
| C-29 | lint features/explore/chris/widgets/circle_animation.dart:11 library_private_types_in_public_api | dart analyze file clean |  |  |
| C-30 | lint features/explore/chris/widgets/text_input_field.dart:9 use_super_parameters | dart analyze file clean |  |  |
| C-31 | lint features/explore/widgets/content_video_card.dart:370 unnecessary_const | dart analyze file clean |  | PASS 1 try, flutter-expert |
| C-32 | lint features/explore/chris/screens/sections/profile_sections.dart:613 unnecessary_const | dart analyze file clean |  |  |
| C-33 | BUG-001 future-dated migrations 20260901/20260902 on disk (decide: rename or gate) | per-item acceptance |  |  |
| C-34 | BUG-003 VERIFY no MWK residue repo-wide (rg MWK lib/ supabase/) | per-item acceptance | PASS 1 try |  |
| C-35 | BUG-005 invoices_page.dart:51 amount drift vs FareBreakdownV2 | per-item acceptance |  |  |
| C-36 | BUG-006 receipt immutability trigger strictness (REMOTE-SCHEMA check) | per-item acceptance |  |  |
| C-37 | T3 finish search-in-feed (superseded? confirm r296-r300 coverage or implement) | per-item acceptance |  |  |
| C-38 | P1.8 run supabase/tests/p1_gate.sql against live DB | per-item acceptance |  |  |
| C-39 | P2a consumer loop UI + cart persistence | per-item acceptance |  |  |
| C-40 | P2b vendor portal + kitchen queue | per-item acceptance |  |  |
| C-41 | P2c courier flow + OTP verification | per-item acceptance |  |  |
| C-42 | P3 Paystack hardening + refunds | per-item acceptance |  |  |
| C-43 | P4 unit tests + seed data + polish | per-item acceptance |  |  |
| C-44 | PostJob P0: wire _submitJob to Supabase jobs (budget_cents, no float) | per-item acceptance |  |  |
| C-45 | add test for lib/app/bootstrap/bootstrap_error_screen.dart | flutter test file green |  |  |
| C-46 | add test for lib/core/finance/service_fare_config.dart | flutter test file green |  |  |
| C-47 | add test for lib/core/providers/theme_provider.dart | flutter test file green |  |  |
| C-48 | add test for lib/core/services/cache_service.dart | flutter test file green |  |  |
| C-49 | add test for lib/core/services/call_video_service.dart | flutter test file green |  |  |
| C-50 | add test for lib/core/services/incoming_call_controller.dart | flutter test file green |  |  |
| C-51 | add test for lib/core/services/intelligence/acoustic_denoise_filter.dart | flutter test file green |  |  |
| C-52 | add test for lib/core/services/intelligence/ai_provider.dart | flutter test file green |  |  |
| C-53 | add test for lib/core/services/intelligence/cloud_stt_service.dart | flutter test file green |  |  |
| C-54 | add test for lib/core/services/intelligence/connectivity_service.dart | flutter test file green |  |  |
| C-55 | add test for lib/core/services/intelligence/intelligence_engine.dart | flutter test file green |  |  |
| C-56 | add test for lib/core/services/intelligence/offline_stt_service.dart | flutter test file green |  |  |
| C-57 | add test for lib/core/services/intelligence/real_voice_listener.dart | flutter test file green |  |  |
| C-58 | add test for lib/core/services/intelligence/sa_entity_extractor.dart | flutter test file green |  |  |
| C-59 | add test for lib/core/services/intelligence/voice_identity.dart | flutter test file green |  |  |
| C-60 | add test for lib/core/services/intelligence/voice_lines.dart | flutter test file green |  |  |
| C-61 | add test for lib/core/services/intelligence/voice_mood.dart | flutter test file green |  |  |
| C-62 | add test for lib/core/services/intelligence/voice_trip_service.dart | flutter test file green |  |  |
| C-63 | add test for lib/core/services/intelligence/zen_provider.dart | flutter test file green |  |  |
| C-64 | add test for lib/core/services/promo_video_service.dart | flutter test file green |  |  |
| C-65 | add test for lib/core/services/push_notification_service.dart | flutter test file green |  |  |
| C-66 | add test for lib/core/services/ride_session_manager.dart | flutter test file green |  |  |
| C-67 | add test for lib/core/services/supabase_admission_extension.dart | flutter test file green |  |  |
| C-68 | add test for lib/core/services/supabase_client.dart | flutter test file green |  |  |
| C-69 | add test for lib/core/widgets/app_buttons.dart | flutter test file green |  |  |
| C-70 | add test for lib/core/widgets/app_error_view.dart | flutter test file green |  |  |
| C-71 | add test for lib/core/widgets/app_loading_view.dart | flutter test file green |  |  |
| C-72 | add test for lib/core/widgets/location_disabled_banner.dart | flutter test file green |  |  |
| C-73 | add test for lib/core/widgets/payment/card_input_formatter.dart | flutter test file green |  |  |
| C-74 | add test for lib/data/repositories/earnings_repository.dart | flutter test file green |  |  |
| C-75 | add test for lib/data/repositories/job_repository.dart | flutter test file green |  |  |
| C-76 | add test for lib/features/account/presentation/widgets/account_drawer.dart | flutter test file green |  |  |
| C-77 | add test for lib/features/activity/data/activity_repository.dart | flutter test file green |  |  |
| C-78 | add test for lib/features/activity/domain/activity_details_model.dart | flutter test file green |  |  |
| C-79 | add test for lib/features/activity/presentation/screens/activity_screen.dart | flutter test file green |  |  |
| C-80 | add test for lib/features/activity/presentation/screens/receipt/receipt_page.dart | flutter test file green |  |  |
| C-81 | add test for lib/features/activity/presentation/widgets/activity_report_sheet.dart | flutter test file green |  |  |
| C-82 | add test for lib/features/auth/controllers/auth_controller.dart | flutter test file green |  |  |
| C-83 | add test for lib/features/auth/controllers/otp_timer_controller.dart | flutter test file green |  |  |
| C-84 | add test for lib/features/auth/models/auth_session_model.dart | flutter test file green |  |  |
| C-85 | add test for lib/features/auth/models/user_model.dart | flutter test file green |  |  |
| C-86 | add test for lib/features/auth/repositories/auth_repository.dart | flutter test file green |  |  |
| C-87 | add test for lib/features/auth/screens/auth_success_screen.dart | flutter test file green |  |  |
| C-88 | add test for lib/features/auth/screens/login_screen.dart | flutter test file green |  |  |
| C-89 | add test for lib/features/auth/screens/profile_setup_screen.dart | flutter test file green |  |  |
| C-90 | add test for lib/features/auth/screens/sign_up_screen.dart | flutter test file green |  |  |
| C-91 | add test for lib/features/auth/screens/terms_screen.dart | flutter test file green |  |  |
| C-92 | add test for lib/features/auth/screens/verify_otp_screen.dart | flutter test file green |  |  |
| C-93 | add test for lib/features/auth/screens/welcome_screen.dart | flutter test file green |  |  |
| C-94 | add test for lib/features/auth/services/auth_service.dart | flutter test file green |  |  |
| C-95 | add test for lib/features/auth/services/otp_service.dart | flutter test file green |  |  |
| C-96 | add test for lib/features/auth/services/user_session_lease_service.dart | flutter test file green |  |  |
| C-97 | add test for lib/features/auth/widgets/auth_buttons.dart | flutter test file green |  |  |
| C-98 | add test for lib/features/auth/widgets/auth_components.dart | flutter test file green |  |  |
| C-99 | add test for lib/features/auth/widgets/auth_email_entry_scaffold.dart | flutter test file green |  |  |
| C-100 | add test for lib/features/auth/widgets/auth_email_field.dart | flutter test file green |  |  |
