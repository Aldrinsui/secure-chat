from django.contrib import admin
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from securechat.api import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/auth/token/', TokenObtainPairView.as_view()),
    path('api/v1/auth/token/refresh/', TokenRefreshView.as_view()),
    path('api/v1/auth/register/', views.register),
    path('api/v1/auth/logout/', views.logout),
    path('api/v1/auth/public-key/', views.update_public_key),
    path('api/v1/users/me/', views.UserDetailView.as_view(), {'pk': 'me'}),
    path('api/v1/users/search/', views.user_search),
    path('api/v1/conversations/', views.ConversationListCreateView.as_view()),
    path('api/v1/conversations/<uuid:pk>/', views.ConversationDetailView.as_view()),
    path('api/v1/conversations/<uuid:conv_id>/messages/', views.MessageListView.as_view()),
    path('api/v1/conversations/<uuid:conv_id>/messages/<uuid:msg_id>/', views.delete_message),
]